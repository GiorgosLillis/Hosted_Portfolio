import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import { isValidEmail, isValidPassword, setAuthCookies, setCorsHeaders, getClientIp } from '../lib/functions.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { sendEmail } from '../lib/mailer.js';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// POST only, verifies credentials and starts a session
const loginHandler = async (req, res) => {
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
        const { email, password } = req.body;
        // IP tracking and per-username tracking for rate limiting
        const ip = getClientIp(req);
        const ipKey = `login_attempt_ip:${ip}`;
        const usernameKey = `login_attempt_username:${email}`;

        const [ipResult, usernameResult] = await Promise.all([
            rateLimiter(ipKey, 5, 300), // 5 attempts per 5 minutes for IP
            rateLimiter(usernameKey, 5, 900) // 5 attempts per 15 minutes for username
        ]);

        if (!ipResult.allowed || !usernameResult.allowed) {
            const ttl = Math.max(ipResult.ttl, usernameResult.ttl);

            // Notify the account owner, once per lockout window, only if the account is real
            if (!usernameResult.allowed) {
                try {
                    const notifyKey = `login_failure_notified:${email}`;
                    const isFirstLockoutThisWindow = await redis.set(notifyKey, '1', { ex: usernameResult.ttl, nx: true }) === 'OK';
                    if (isFirstLockoutThisWindow) {
                        const user = await prisma.user.findUnique({ where: { email }, select: { email: true } });
                        if (user) {
                            const from = `"Account Security" <${process.env.EMAIL_ID}>`;
                            const to = user.email;
                            const subject = 'Multiple failed login attempts';
                            const message = `<p>We noticed multiple failed login attempts on your account. If this wasn't you, consider changing your password.</p>`;
                            await sendEmail({ from, to, subject, message });
                        }
                    }
                } catch (error) {
                    console.error('Failed to send login-attempt notification email:', error);
                }
            }

            res.setHeader('Retry-After', ttl);
            return res.status(429).json({
                success: false,
                message: `Too many login attempts. Please try again in ${ttl} seconds.`
            });
        }

        if (!isValidEmail(email) || !isValidPassword(password)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input. Please ensure all fields are correctly filled.'
            });
        }

        // Look up by email and compare the submitted password against the stored hash
        const user = await prisma.user.findUnique({
            where: { email: email }
        });
        const passwordMatch = user ? await bcrypt.compare(password, user.passwordHash) : false;

        // Same generic message whether the email or the password was wrong
        if (!user || !passwordMatch) {
            return res.status(400).json({
                success: false,
                message: 'Invalid credentials.'
            });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                success: false,
                message: 'JWT secret is not configured on the server'
            });
        }

        // Track last login time
        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
        });

        // Issue a fresh session token
        const token = jsonwebtoken.sign(
            { userId: user.id, email: user.email, tokenVersion: user.tokenVersion },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        setAuthCookies(res, token);

        const userData = { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName };
        return res.status(200).json({ user: userData });
    }
    catch (error) {

        console.error('Error during login:', error);
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred',
            error: process.env.NODE_ENV === 'development' ? error.message : null
        });


    }
}

export default async function handler(req, res) {
    return recaptchaMiddleware(req, res, () => loginHandler(req, res));
}