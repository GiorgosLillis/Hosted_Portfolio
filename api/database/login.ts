import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import { setAuthCookies, setCorsHeaders, getClientIp, sendStatus } from '../lib/functions.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { normalizeEmail, isValidEmail, isValidPassword } from '../lib/sanitize.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { sendEmail } from '../lib/mailer.js';
import { createEmailToken, sendVerificationEmail } from '../lib/emailVerification.js';
import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const redis = Redis.fromEnv();

// POST only, verifies credentials and starts a session
const loginHandler = async (req: VercelRequest, res: VercelResponse) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return sendStatus(res, 405, 'method-not-allowed', 'Only POST requests are allowed');
    }

    try {
        const { password } = req.body;
        const email = normalizeEmail(req.body.email);
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
                            const from = `"Account Security" <${process.env.MAIL_FROM}>`;
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
            return sendStatus(res, 429, 'rate-limited', `Too many login attempts. Please try again in ${ttl} seconds.`, { ttl: ttl });
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not configured on the server');
            return sendStatus(res, 500, 'server-misconfigured', 'The server is not configured correctly');
        }

        if (!isValidEmail(email) || !isValidPassword(password)) {
            return sendStatus(res, 400, 'invalid-input', 'Invalid input. Please ensure all fields are correctly filled.');
        }



        // Look up by email and compare the submitted password against the stored hash
        const user = await prisma.user.findUnique({
            where: { email: email }
        });
        const passwordMatch = user ? await bcrypt.compare(password, user.passwordHash) : false;

        // Same generic message whether the email or the password was wrong
        if (!user || !passwordMatch) {
            return sendStatus(res, 400, 'invalid-credentials', 'Invalid credentials.');
        }

        // Only reached with the right password, so this can't be used to flood a stranger's inbox. At most one automatic
        // link per account every 10 minutes, the "resend" button covers anything more.
        if (!user.emailVerifiedAt) {
            let linkSent = false;
            try {
                if (await redis.set(`verification_auto_sent:${user.id}`, '1', { ex: 600, nx: true }) === 'OK') {
                    const rawToken = await createEmailToken('verify', user.id, user.email);
                    await sendVerificationEmail(user.email, rawToken, 'verify');
                    linkSent = true;
                }
            } catch (error) {
                console.error('Failed to send the confirmation email on login:', error);
            }
            return linkSent
                ? sendStatus(res, 403, 'email-not-verified-sent', 'Confirm your email address before logging in. We just sent you a new link.')
                : sendStatus(res, 403, 'email-not-verified', 'Confirm your email address before logging in.');
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

        const userData = { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, createdAt: user.createdAt };
        return res.status(200).json({ success: true, user: userData });
    }
    catch (error) {

        console.error('Error during login:', error);
        return sendStatus(res, 500, 'server-error', 'An unexpected error occurred', { error: process.env.NODE_ENV === 'development' ? (error as { message?: string }).message : null });


    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return recaptchaMiddleware(req, res, () => loginHandler(req, res));
}