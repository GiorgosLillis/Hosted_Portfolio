import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { isValidEmail, isValidPassword, setCorsHeaders, getClientIp, handleApiError } from '../lib/functions.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { sendEmail } from '../lib/mailer.js';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST requests a reset link, PUT redeems one and sets the new password
async function passwordRecoveryHandler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method === 'POST') {
        return requestReset(req, res);
    }

    if (req.method === 'PUT') {
        return redeemReset(req, res);
    }

    return res.status(405).json({
        success: false,
        message: 'Only POST and PUT requests are allowed'
    });
}

async function requestReset(req, res) {
    try {
        const { email } = req.body;
        // Rate limiting using IP and email
        const ip = getClientIp(req);
        const ipKey = `forget_attempt_ip:${ip}`;
        const emailKey = `forget_password_attempt_email:${email}`;

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

        if (!email || !emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid input.' });
        }

        // Generate token
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

            await redis.set(`password_reset:${tokenHash}`, user.id, { ex: 1800 }); // 30 minutes

            const resetUrl = `${process.env.FRONTEND_URL}/reset.html?token=${rawToken}&email=${encodeURIComponent(email)}`;

            const from = `"Account Security" <${process.env.EMAIL_ID}>`;
            const to = email;
            const subject = 'Reset your password';
            const message = `<p>Click the link below to reset your password. This link expires in 30 minutes.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`;
            await sendEmail({ from, to, subject, message });
        }

        // Same response whether or not the account exists
        return res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a reset link has been sent.'
        });
    } catch (error) {
        return handleApiError(res, error, 'Server error in password recovery (request):');
    }
}

async function redeemReset(req, res) {
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
        return handleApiError(res, error, 'Server error in password recovery (redeem):');
    }
}

export default async function handler(req, res) {
    return recaptchaMiddleware(req, res, () => passwordRecoveryHandler(req, res));
}
