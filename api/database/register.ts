import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { Redis } from '@upstash/redis';
import { setCorsHeaders, getClientIp, sendStatus, clearAuthCookies } from '../lib/functions.js';
import sanitizeHTML, { normalizeEmail, isValidEmail, isValidPassword, isValidName } from '../lib/sanitize.js';
import { enforceRateLimits } from '../lib/http.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { isValidCronAuthorization } from '../lib/push.js';
import { sendEmail } from '../lib/mailer.js';
import { checkEmailDomain, createEmailToken, consumeEmailToken, sendVerificationEmail, VERIFY_DEADLINE_MS } from '../lib/emailVerification.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const redis = Redis.fromEnv();

function serverError(res: VercelResponse, error: unknown, context: string) {
    console.error(context, error);
    return sendStatus(res, 500, 'server-error', 'An unexpected error occurred', { error: process.env.NODE_ENV === 'development' ? (error as { message?: string }).message : undefined });
}

// POST, creates an unconfirmed account and emails it a confirmation link. Nobody is logged in until the link is clicked.
const registerHandler = async (req: VercelRequest, res: VercelResponse) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return sendStatus(res, 405, 'method-not-allowed', 'Only POST requests are allowed');
    }

    try {
        const { password, first_name, last_name } = req.body;
        const email = normalizeEmail(req.body.email);
        const ip = getClientIp(req);
        if (!(await enforceRateLimits(res,
            [`register_attempt_ip:${ip}`, 5, 600],      // 5 registration attempts per IP every 10 minutes
            [`register_attempt_email:${email}`, 3, 1800] // 3 registration attempts per email every 30 minutes
        ))) return;

        if (!isValidEmail(email) || !isValidPassword(password) || !isValidName(first_name) || !isValidName(last_name)) {
            return sendStatus(res, 400, 'invalid-input', 'Invalid input. Please ensure all fields are correctly filled.');
        }

        const domainCheck = await checkEmailDomain(email);
        if (domainCheck === 'disposable') {
            return sendStatus(res, 400, 'email-disposable', 'Temporary email addresses are not accepted.');
        }
        if (domainCheck === 'no-mail') {
            return sendStatus(res, 400, 'email-domain-invalid', 'This email domain cannot receive mail. Check the address for typos.');
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return sendStatus(res, 400, 'email-exists', 'User with this email already exists');
        }

        const newUser = await prisma.user.create({
            data: {
                email,
                passwordHash: await bcrypt.hash(password, 10),
                firstName: sanitizeHTML(first_name),
                lastName: sanitizeHTML(last_name),
                tokenVersion: 0,
                verifyDeadline: new Date(Date.now() + VERIFY_DEADLINE_MS),
            }
        });

        // The account exists either way, a failed send can be retried with "resend confirmation" from the login form
        try {
            const rawToken = await createEmailToken('verify', newUser.id, newUser.email);
            await sendVerificationEmail(newUser.email, rawToken, 'verify');
        } catch (error) {
            console.error('Failed to send the confirmation email after sign-up:', error);
            return sendStatus(res, 200, 'verification-send-failed', 'Account created, but the confirmation email could not be sent. Use "resend confirmation" when logging in.', { email: newUser.email });
        }

        return sendStatus(res, 200, 'verification-sent', 'Account created. Check your inbox to confirm your email address.', { email: newUser.email });

    } catch (error) {
        return serverError(res, error, 'Server error on register:');
    }
};

async function verifyEmail(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    if (req.method !== 'POST') {
        return sendStatus(res, 405, 'method-not-allowed', 'Only POST requests are allowed');
    }

    try {
        if (!(await enforceRateLimits(res, [`verify_email_attempt_ip:${getClientIp(req)}`, 20, 600]))) return;

        const payload = await consumeEmailToken(req.body?.token);
        const user = payload && await prisma.user.findUnique({ where: { id: payload.userId } });
        if (!payload || !user) {
            return sendStatus(res, 400, 'verification-link-invalid', 'This confirmation link is invalid, already used or expired.');
        }

        if (payload.purpose === 'verify') {
            // A link sent to an address the account no longer has must not confirm the current one
            if (user.email !== payload.email) {
                return sendStatus(res, 400, 'verification-link-invalid', 'This confirmation link is invalid, already used or expired.');
            }
            if (!user.emailVerifiedAt) {
                await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), verifyDeadline: null } });
            }
            return sendStatus(res, 200, 'email-verified', 'Your email is confirmed. You can log in now.');
        }

        if (payload.purpose === 'delete') {
            // Requested for the address the account had then; after an email change that old link no longer counts
            if (user.email !== payload.email) {
                return sendStatus(res, 400, 'verification-link-invalid', 'This confirmation link is invalid, already used or expired.');
            }
            // Favorite cities and the shopping list go with it (onDelete: Cascade)
            await prisma.user.delete({ where: { id: user.id } });
            try {
                await redis.del(`user_session:${user.id}`);
            } catch (error) {
                console.error('Failed to clear the cached session after deleting an account:', error);
            }
            // Logs out the browser that clicked the link, other devices fail checkToken since the account is gone
            clearAuthCookies(res);
            return sendStatus(res, 200, 'account-deleted', 'Account deleted successfully.');
        }

        // Email change: the new address is proven, so it replaces the old one and every session has to log in again
        const oldEmail = user.email;
        try {
            await prisma.user.update({
                where: { id: user.id },
                data: { email: payload.email, emailVerifiedAt: new Date(), verifyDeadline: null, tokenVersion: { increment: 1 } },
            });
        } catch (error) {
            const { code, message } = error as { code?: string; message?: string };
            if (code === 'P2002' || message?.includes('users_email_key')) {
                return sendStatus(res, 400, 'email-exists', 'Another account started using this email in the meantime.');
            }
            throw error;
        }

        try {
            await redis.del(`user_session:${user.id}`);
        } catch (error) {
            console.error('Failed to clear the cached session after an email change:', error);
        }

        try {
            await sendEmail({
                from: `"Account Security" <${process.env.MAIL_FROM}>`,
                to: oldEmail,
                subject: 'Your email address was changed',
                message: `<p>The email address of your account is now ${sanitizeHTML(payload.email)}. You were logged out everywhere and log in with the new address from now on.</p>`
                    + '<p>If this was not you, reply to this email right away.</p>',
            });
        } catch (error) {
            console.error('Failed to notify the old address about the email change:', error);
        }

        return sendStatus(res, 200, 'email-changed', 'Your email address was changed. Log in with the new address.', { email: payload.email });

    } catch (error) {
        return serverError(res, error, 'Server error on email verification:');
    }
}

async function resendVerification(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    if (req.method !== 'POST') {
        return sendStatus(res, 405, 'method-not-allowed', 'Only POST requests are allowed');
    }

    try {
        const email = normalizeEmail(req.body?.email);
        if (!(await enforceRateLimits(res,
            [`resend_verification_ip:${getClientIp(req)}`, 5, 600],   // 5 per IP every 10 minutes
            [`resend_verification_email:${email}`, 3, 1800]           // 3 per address every 30 minutes
        ))) return;

        if (!isValidEmail(email)) {
            return sendStatus(res, 400, 'invalid-input', 'Invalid input. Please ensure all fields are correctly filled.');
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (user && !user.emailVerifiedAt) {
            const rawToken = await createEmailToken('verify', user.id, user.email);
            await sendVerificationEmail(user.email, rawToken, 'verify');
        }

        return sendStatus(res, 200, 'verification-resent', 'If that account still needs confirming, a new link is on its way.');
    } catch (error) {
        return serverError(res, error, 'Server error on resending the confirmation email:');
    }
}

// Cron-only (daily): deletes sign-ups still unconfirmed after their deadline. Accounts from before verification have
// no deadline, so they are never removed here, they just can't log in until they confirm.
async function cleanupUnverified(req: VercelRequest, res: VercelResponse) {
    if (!isValidCronAuthorization(req.headers['authorization'], process.env.CRON_SECRET)) {
        return sendStatus(res, 401, 'not-authenticated', 'Not authenticated');
    }

    try {
        const { count } = await prisma.user.deleteMany({
            where: { emailVerifiedAt: null, verifyDeadline: { lt: new Date() } },
        });
        return sendStatus(res, 200, 'cleanup-done', `Deleted ${count} unconfirmed accounts.`, { count });
    } catch (error) {
        return serverError(res, error, 'Server error on cleaning up unconfirmed accounts:');
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;
    if (action === 'verify') {
        return verifyEmail(req, res);
    }
    if (action === 'cleanup') {
        return cleanupUnverified(req, res);
    }
    if (action === 'resend') {
        return recaptchaMiddleware(req, res, () => resendVerification(req, res));
    }
    return recaptchaMiddleware(req, res, () => registerHandler(req, res));
}
