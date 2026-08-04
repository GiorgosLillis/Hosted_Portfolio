import { prisma } from '../lib/prisma.js';
import jsonwebtoken from 'jsonwebtoken';
import { Redis } from '@upstash/redis';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { sendEmail } from '../lib/mailer.js';
import { checkToken, clearAuthCookies, setAuthCookies, setCorsHeaders, getClientIp, enforceRateLimit, handleApiError } from '../lib/functions.js';

const redis = Redis.fromEnv();

// GET logs out the current device, POST logs out every other device
async function sessionHandler(req, res) {
    setCorsHeaders(res);
    // Never let the browser/CDN cache this - a cached logout response would keep replaying stale cookies
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method === 'GET') {
        clearAuthCookies(res);
        return res.status(200).json({ success: true, message: 'Logged out successfully' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: 'Only GET and POST requests are allowed'
        });
    }

    try {
        const user = await checkToken(req);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const ip = getClientIp(req);
        if (!(await enforceRateLimit(res, `logout_devices_attempt_ip:${ip}`, 30, 60))) return; // 30 requests per minute per IP
        if (!(await enforceRateLimit(res, `logout_devices_attempt:${user.id}`, 15, 60))) return; // 15 requests per minute

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
        return handleApiError(res, error, 'Server error in session (logout devices):');
    }
}

export default async function handler(req, res) {
    if (req.method === 'POST') {
        return recaptchaMiddleware(req, res, () => sessionHandler(req, res));
    }
    return sessionHandler(req, res);
}
