import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { isValidEmail, isValidPassword, setCorsHeaders, getClientIp } from '../lib/functions.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { sendEmail } from '../lib/mailer.js';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const resetHandler = async (req, res) => {

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

        const { email, token, new_password } = req.body;
        // Rate limiting using IP and email
        const ip = getClientIp(req);
        const ipKey = `reset_attempt_ip:${ip}`;
        const emailKey = `reset_password_attempt_email:${email}`;

        const [ipResult, emailResult] = await Promise.all([
            rateLimiter(ipKey, 3, 600), // 3 attempts per 10 mminutes for IP
            rateLimiter(emailKey, 3, 1800) // 3 attempts per 30 mminutes for email
        ]);

        if (!ipResult.allowed || !emailResult.allowed) {
            const ttl = Math.max(ipResult.ttl, emailResult.ttl);
            res.setHeader('Retry-After', ttl);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please try again in ${ttl} seconds.`
            });
        }

        if (!token || !isValidEmail(email) || !isValidPassword(new_password)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input. Please ensure all fields are correctly filled.'
            });
        }

        // The raw token only ever lived in the emailed link, only its hash is stored
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const redisKey = `password_reset:${tokenHash}`;
        const userId = await redis.get(redisKey);

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset link.'
            });
        }

        // Look up the real account rather than trusting the client-submitted email,
        // also needed to compare against the current password below
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset link.'
            });
        }

        const isSameAsOldPassword = await bcrypt.compare(new_password, user.passwordHash);
        if (isSameAsOldPassword) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from your current password.'
            });
        }

        const passwordHash = await bcrypt.hash(new_password, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash, tokenVersion: { increment: 1 } }
        });

        // Single-use, gets deleted the moment it's been redeemed
        await redis.del(redisKey);

        // Invalidate any cached session so a password change takes effect everywhere immediately
        try {
            await redis.del(`user_session:${userId}`);
        } catch (error) {
            console.error('Failed to clear cached session after password reset:', error);
        }

        try {
            const from = `"Account Security" <${process.env.EMAIL_ID}>`;
            const to = user.email;
            const subject = 'Password reset successful';
            const message = `<p>Your password reset request has been completed successfully!</p>`;
            await sendEmail({ from, to, subject, message });
        } catch (error) {
            console.error('Failed to send password reset confirmation email:', error);
        }

        return res.status(200).json({
            success: true,
            message: 'Password has been reset successfully.'
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export default async function handler(req, res) {
    return recaptchaMiddleware(req, res, () => resetHandler(req, res));
}