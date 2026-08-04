import { prisma } from '../lib/prisma.js';
import jsonwebtoken from 'jsonwebtoken';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { Redis } from '@upstash/redis';
import { rateLimiter } from '../lib/rateLimiter.js';
import { checkToken, setAuthCookies, setCorsHeaders, getClientIp } from '../lib/functions.js';
import { sendEmail } from '../lib/mailer.js';
const redis = Redis.fromEnv();

const LogoutDevicesHandler = async (req, res) => {

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
        const user = await checkToken(req);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const ip = getClientIp(req);
        const ipCheck = await rateLimiter(`logout_devices_attempt_ip:${ip}`, 30, 60); // 30 requests per minute per IP
        if (!ipCheck.allowed) {
            res.setHeader('Retry-After', ipCheck.ttl);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please try again in ${ipCheck.ttl} seconds.`
            });
        }

        const userKey = `logout_devices_attempt:${user.id}`;
        const { allowed, ttl } = await rateLimiter(userKey, 15, 60); // 15 requests per minute

        if (!allowed) {
            res.setHeader('Retry-After', ttl);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please try again in ${ttl} seconds.`
            });
        }

        const updatedUser = await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });

        try {
            await redis.del(`user_session:${user.id}`);
        } catch (error) {
            console.error('Failed to clear cached session:', error);
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
            const subject = 'Devices logout';
            const message = `<p>You have logged out all devices connected to your account.</p>`;
            await sendEmail({ from, to, subject, message });
        } catch (error) {
            console.error('Failed to send devices logout confirmation email:', error);
        }

        return res.status(200).json({
            success: true,
            message: 'Logged out of other devices successfully',
        });

    } catch (error) {
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
    return recaptchaMiddleware(req, res, () => LogoutDevicesHandler(req, res));
}