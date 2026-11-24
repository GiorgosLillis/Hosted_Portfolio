import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import sanitizeHTML, { normalizeEmail, isValidEmail, isValidPassword, isValidName } from '../lib/sanitize.js';
import { checkToken, setAuthCookies, setCorsHeaders, getClientIp, enforceRateLimits, handleApiError, sendStatus } from '../lib/functions.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { sendEmail } from '../lib/mailer.js';
import { checkEmailDomain, createEmailToken, sendVerificationEmail } from '../lib/emailVerification.js';
import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const redis = Redis.fromEnv();

// GET returns the logged-in user's own data, PUT edits it, DELETE removes the account
async function accountHandler(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);
    // Never let the browser/CDN cache this - a cached response would keep showing a logged-in user after logout
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method === 'GET') {
        return getAccount(req, res);
    }
    if (req.method === 'PUT') {
        return editAccount(req, res);
    }
    if (req.method === 'DELETE') {
        return deleteAccount(req, res);
    }

    return sendStatus(res, 405, 'method-not-allowed', 'Only GET, PUT and DELETE requests are allowed');
}

async function getAccount(req: VercelRequest, res: VercelResponse) {
    try {
        const user = await checkToken(req);
        const userKey = `get_user_attempt:${user.id}`;

        if (!(await enforceRateLimits(res, [userKey, 30, 60]))) return; // 30 requests per minute

        const userData = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            createdAt: user.createdAt
        };
        res.status(200).json({ success: true, user: userData });
    } catch (error) {
        sendStatus(res, 401, 'not-authenticated', 'Not authenticated');
    }
}

async function editAccount(req: VercelRequest, res: VercelResponse) {
    try {
        const user = await checkToken(req);

        const ip = getClientIp(req);
        if (!(await enforceRateLimits(res,
            [`edit_user_attempt_ip:${ip}`, 30, 60],  // 30 requests per minute per IP
            [`edit_user_attempt:${user.id}`, 15, 60] // 15 requests per minute per user
        ))) return;

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not configured on the server');
            return sendStatus(res, 500, 'server-misconfigured', 'The server is not configured correctly');
        }

        const { current_password, password, first_name, last_name } = req.body;
        const email = normalizeEmail(req.body.email);
        const updateData: {
            firstName?: string;
            lastName?: string;
            passwordHash?: string;
            tokenVersion?: { increment: number };
        } = {};

        // current_password, email, first_name and last_name are required to make any change, new password is optional
        if (!isValidEmail(email) || !isValidName(first_name) || !isValidName(last_name) || !isValidPassword(current_password)) {
            return sendStatus(res, 400, 'invalid-input', 'Invalid input. Please ensure all fields are correctly filled.');
        }
        if (password && !isValidPassword(password)) {
            return sendStatus(res, 400, 'invalid-input', 'Invalid input. Please ensure all fields are correctly filled.');
        }

        const stored = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
        if (!stored) {
            return sendStatus(res, 401, 'not-authenticated', 'Not authenticated');
        }

        const passwordMatch = await bcrypt.compare(current_password, stored.passwordHash);
        if (!passwordMatch) {
            return sendStatus(res, 400, 'invalid-password', 'Invalid password');
        }

        const safeFirstName = sanitizeHTML(first_name);
        const safeLastName = sanitizeHTML(last_name);
        const emailChanged = email !== user.email.toLowerCase();
        const nameChanged = safeFirstName !== user.firstName || safeLastName !== user.lastName;

        // A new address is only checked here: it replaces the old one when the link sent to it is clicked
        if (emailChanged) {
            const domainCheck = await checkEmailDomain(email);
            if (domainCheck === 'disposable') {
                return sendStatus(res, 400, 'email-disposable', 'Temporary email addresses are not accepted.');
            }
            if (domainCheck === 'no-mail') {
                return sendStatus(res, 400, 'email-domain-invalid', 'This email domain cannot receive mail. Check the address for typos.');
            }
            if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
                return sendStatus(res, 400, 'email-exists', 'User with this email already exists');
            }
        }

        if (first_name) updateData.firstName = safeFirstName;
        if (last_name) updateData.lastName = safeLastName;

        // A new password logs every other device out (an email change does so when it is confirmed)
        if (password) {
            updateData.passwordHash = await bcrypt.hash(password, 10);
            updateData.tokenVersion = { increment: 1 };
        }

        if (Object.keys(updateData).length === 0) {
            return sendStatus(res, 400, 'no-data', 'No data to update.');
        }

        const updatedUser = await prisma.user.update({
            where: {
                id: user.id,
            },
            data: updateData,
        });

        try {
            await redis.del(`user_session:${user.id}`);
        } catch (error) {
            console.error('Failed to clear cached session after an account edit:', error);
        }

        const token = jsonwebtoken.sign(
            { userId: user.id, email: updatedUser.email, tokenVersion: updatedUser.tokenVersion },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        setAuthCookies(res, token);

        let changeLinkSent = false;
        if (emailChanged) {
            try {
                const rawToken = await createEmailToken('change', user.id, email);
                await sendVerificationEmail(email, rawToken, 'change');
                changeLinkSent = true;
            } catch (error) {
                console.error('Failed to send the confirmation link for an email change:', error);
            }
        }

        try {
            const from = `"Account Security" <${process.env.MAIL_FROM}>`;
            const to = user.email;
            const subject = 'Account details edit';
            const changes = [];
            if (nameChanged) changes.push('your name');
            if (password) changes.push('your password');
            const message = (changes.length ? `<p>You changed ${changes.join(', ')}.</p>` : '')
                + (emailChanged ? `<p>A change of your email address to ${sanitizeHTML(email)} was requested. It takes effect once the link sent to that address is clicked.</p>` : '')
                + (!changes.length && !emailChanged ? '<p>Your account details were saved.</p>' : '')
                + (password ? '<p>You were logged out of your other devices.</p>' : '')
                + '<p>If this was not you, reset your password right away.</p>';
            await sendEmail({ from, to, subject, message });
        } catch (error) {
            console.error('Failed to send edit confirmation email:', error);
        }

        const userData = {
            id: updatedUser.id,
            email: updatedUser.email,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            tokenVersion: updatedUser.tokenVersion
        };
        if (emailChanged) {
            return changeLinkSent
                ? sendStatus(res, 200, 'email-change-pending', 'Saved. Click the link sent to the new address to switch to it.', { user: userData, pendingEmail: email })
                : sendStatus(res, 200, 'email-change-send-failed', 'Saved, but the confirmation email to the new address could not be sent. Try changing it again.', { user: userData });
        }
        return sendStatus(res, 200, 'user-updated', 'User updated successfully', { user: userData });

    } catch (error) {
        // Another account already uses the new email address. The Neon adapter reports this without Prisma's P2002 code, only in the message.
        const { code, message } = error as { code?: string; message?: string };
        if (code === 'P2002' || message?.includes('users_email_key')) {
            return sendStatus(res, 400, 'email-exists', 'User with this email already exists');
        }
        return handleApiError(res, error, 'Server error on edit:');
    }
}

async function deleteAccount(req: VercelRequest, res: VercelResponse) {
    try {
        const user = await checkToken(req);

        const ip = getClientIp(req);
        if (!(await enforceRateLimits(res,
            [`delete_user_attempt_ip:${ip}`, 10, 3600], // 10 requests per hour per IP
            [`delete_user_attempt:${user.id}`, 3, 3600] // 3 requests per hour per user
        ))) return;

        const { password } = req.body;
        if (!password) {
            return sendStatus(res, 400, 'password-required', 'Password is required for account deletion.');
        }

        if (!isValidPassword(password)) {
            return sendStatus(res, 400, 'invalid-password', 'Invalid password.');
        }
        const stored = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
        if (!stored) {
            return sendStatus(res, 401, 'not-authenticated', 'Not authenticated');
        }
        const passwordMatch = await bcrypt.compare(password, stored.passwordHash);
        if (!passwordMatch) {
            return sendStatus(res, 401, 'invalid-password', 'Invalid password.');
        }

        // Nothing is deleted yet: the account goes when the link sent to its address is clicked (register.ts, action "verify")
        const rawToken = await createEmailToken('delete', user.id, user.email);
        await sendVerificationEmail(user.email, rawToken, 'delete');

        return sendStatus(res, 200, 'delete-pending', 'Check your email and click the link to delete your account.');

    } catch (error) {
        return handleApiError(res, error, 'Server error on delete:');
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'PUT' || req.method === 'DELETE') {
        return recaptchaMiddleware(req, res, () => accountHandler(req, res));
    }
    return accountHandler(req, res);
}
