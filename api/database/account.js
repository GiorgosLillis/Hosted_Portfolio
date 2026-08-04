import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import sanitizeHTML from '../lib/sanitize.js';
import { checkToken, isValidEmail, isValidPassword, isValidName, setAuthCookies, clearAuthCookies, setCorsHeaders, getClientIp, enforceRateLimit, handleApiError } from '../lib/functions.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { sendEmail } from '../lib/mailer.js';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// GET returns the logged-in user's own data, PUT edits it, DELETE removes the account
async function accountHandler(req, res) {
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

    return res.status(405).json({
        success: false,
        message: 'Only GET, PUT and DELETE requests are allowed'
    });
}

async function getAccount(req, res) {
    try {
        const user = await checkToken(req);
        const userKey = `get_user_attempt:${user.id}`;

        if (!(await enforceRateLimit(res, userKey, 30, 60))) return; // 30 requests per minute

        const userData = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            createdAt: user.createdAt
        };
        res.status(200).json({ user: userData });
    } catch (error) {
        res.status(401).json({ error: 'Not authenticated' });
    }
}

async function editAccount(req, res) {
    try {
        const user = await checkToken(req);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const ip = getClientIp(req);
        if (!(await enforceRateLimit(res, `edit_user_attempt_ip:${ip}`, 30, 60))) return; // 30 requests per minute per IP
        if (!(await enforceRateLimit(res, `edit_user_attempt:${user.id}`, 15, 60))) return; // 15 requests per minute

        const { email, current_password, password, first_name, last_name } = req.body;
        const updateData = {};

        // current_password, email, first_name and last_name are required to make any change, new password is optional
        if (!isValidEmail(email) || !isValidName(first_name) || !isValidName(last_name) || !isValidPassword(current_password)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input. Please ensure all fields are correctly filled.'
            });
        }
        if (password && !isValidPassword(password)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input. Please ensure all fields are correctly filled.'
            });
        }

        // Confirm the current password
        const passwordMatch = await bcrypt.compare(current_password, user.passwordHash);
        if (!passwordMatch) {
            return res.status(400).json({
                success: false,
                message: 'Invalid password'
            });
        }

        if (email) updateData.email = email;
        if (first_name) updateData.firstName = sanitizeHTML(first_name);
        if (last_name) updateData.lastName = sanitizeHTML(last_name);

        // Rehash and update the password if a new one was provided
        if (password) {
            updateData.passwordHash = await bcrypt.hash(password, 10);
            updateData.tokenVersion = { increment: 1 };
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No data to update.' });
        }

        const updatedUser = await prisma.user.update({
            where: {
                id: user.id,
            },
            data: updateData,
        });

        // If password has been changed, log out and terminate session
        if (password) {
            try {
                await redis.del(`user_session:${user.id}`);
            } catch (error) {
                console.error('Failed to clear cached session after password change:', error);
            }
        }

        // Re-issue the session token since the user's data (e.g. email) may have changed
        const token = jsonwebtoken.sign(
            { userId: user.id, email: updatedUser.email, tokenVersion: updatedUser.tokenVersion },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        setAuthCookies(res, token);

        try {
            const from = `"Account Security" <${process.env.EMAIL_ID}>`;
            const to = user.email;
            const subject = 'Account details edit';
            const message = `<p>Some of your account details have been edited</p>`;
            await sendEmail({ from, to, subject, message });
        } catch (error) {
            console.error('Failed to send edit confirmation email:', error);
        }

        return res.status(200).json({
            success: true,
            message: 'User updated successfully',
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                tokenVersion: updatedUser.tokenVersion
            }
        });

    } catch (error) {
        return handleApiError(res, error, 'Server error on edit:');
    }
}

async function deleteAccount(req, res) {
    try {
        const user = await checkToken(req);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const ip = getClientIp(req);
        if (!(await enforceRateLimit(res, `delete_user_attempt_ip:${ip}`, 10, 3600))) return; // 10 requests per hour per IP
        if (!(await enforceRateLimit(res, `delete_user_attempt:${user.id}`, 3, 3600))) return; // 3 requests per hour

        const { password } = req.body;
        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required for account deletion.'
            });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid password.'
            });
        }
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password.'
            });
        }

        await prisma.user.delete({
            where: {
                id: user.id,
            },
        });

        clearAuthCookies(res);

        return res.status(200).json({
            success: true,
            message: 'Account deleted successfully.'
        });

    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }
        return handleApiError(res, error, 'Server error on delete:');
    }
}

export default async function handler(req, res) {
    if (req.method === 'PUT' || req.method === 'DELETE') {
        return recaptchaMiddleware(req, res, () => accountHandler(req, res));
    }
    return accountHandler(req, res);
}
