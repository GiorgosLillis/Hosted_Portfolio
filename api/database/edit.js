import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import sanitizeHTML from '../lib/sanitize.js';
import { checkToken, isValidEmail, isValidPassword, isValidName, setAuthCookies, setCorsHeaders, getClientIp } from '../lib/functions.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { sendEmail } from '../lib/mailer.js';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// PUT only, updates the logged-in user's own account
const editUserHandler = async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'PUT') {
        return res.status(405).json({
            success: false,
            message: 'Only PUT requests are allowed'
        });
    }

    try {
        // Check user token validation
        const user = await checkToken(req);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const ip = getClientIp(req);
        const ipCheck = await rateLimiter(`edit_user_attempt_ip:${ip}`, 30, 60); // 30 requests per minute per IP
        if (!ipCheck.allowed) {
            res.setHeader('Retry-After', ipCheck.ttl);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please try again in ${ipCheck.ttl} seconds.`
            });
        }

        const userKey = `edit_user_attempt:${user.id}`;
        const { allowed, ttl } = await rateLimiter(userKey, 15, 60); // 15 requests per minute

        if (!allowed) {
            res.setHeader('Retry-After', ttl);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please try again in ${ttl} seconds.`
            });
        }

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
        console.error('Server error on edit:', error);
        if (error.message === 'Invalid or expired token.') {
            return res.status(401).json({ success: false, message: error.message });
        }
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export default async function handler(req, res) {
    return recaptchaMiddleware(req, res, () => editUserHandler(req, res));
}