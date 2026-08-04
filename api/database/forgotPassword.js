import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { setCorsHeaders, getClientIp } from '../lib/functions.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { sendEmail } from '../lib/mailer.js';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const forgotHandler = async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: 'Only POST requests are allowed'
        });
    }

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
        console.error('Server error on reset:', error);
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }


}

export default async function handler(req, res) {
    return recaptchaMiddleware(req, res, () => forgotHandler(req, res));
}