import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { setCorsHeaders, getClientIp, handleApiError, sendStatus } from '../lib/functions.js';
import { enforceRateLimits } from '../lib/http.js';
import { normalizeEmail, isValidEmail, isValidPassword } from '../lib/sanitize.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { sendEmail } from '../lib/mailer.js';
import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const redis = Redis.fromEnv();

// POST requests a reset link, PUT redeems one and sets the new password
async function passwordRecoveryHandler(req: VercelRequest, res: VercelResponse) {
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

    return sendStatus(res, 405, 'method-not-allowed', 'Only POST and PUT requests are allowed');
}

async function requestReset(req: VercelRequest, res: VercelResponse) {
    try {
        const email = normalizeEmail(req.body.email);
        const ip = getClientIp(req);
        if (!(await enforceRateLimits(res,
            [`forget_attempt_ip:${ip}`, 3, 600],                // 3 attempts per 10 minutes per IP
            [`forget_password_attempt_email:${email}`, 3, 1800] // 3 attempts per 30 minutes per email
        ))) return;

        if (!isValidEmail(email)) {
            return sendStatus(res, 400, 'invalid-input', 'Invalid input.');
        }

        // Generate token
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

            await redis.set(`password_reset:${tokenHash}`, user.id, { ex: 1800 }); // 30 minutes

            const resetUrl = `${process.env.FRONTEND_URL}/reset.html?token=${rawToken}&email=${encodeURIComponent(email)}`;

            const from = `"Account Security" <${process.env.MAIL_FROM}>`;
            const to = email;
            const subject = 'Reset your password';
            const message = `<p>Click the link below to reset your password. This link expires in 30 minutes.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`;
            await sendEmail({ from, to, subject, message });
        }

        // Same response whether or not the account exists
        return sendStatus(res, 200, 'reset-link-sent', 'If an account with that email exists, a reset link has been sent.');
    } catch (error) {
        return handleApiError(res, error, 'Server error in password recovery (request):');
    }
}

async function redeemReset(req: VercelRequest, res: VercelResponse) {
    try {
        const { token, new_password } = req.body;
        const email = normalizeEmail(req.body.email);
        const ip = getClientIp(req);
        if (!(await enforceRateLimits(res,
            [`reset_attempt_ip:${ip}`, 3, 600],                // 3 attempts per 10 minutes per IP
            [`reset_password_attempt_email:${email}`, 3, 1800] // 3 attempts per 30 minutes per email
        ))) return;

        if (!token || !isValidEmail(email) || !isValidPassword(new_password)) {
            return sendStatus(res, 400, 'invalid-input', 'Invalid input. Please ensure all fields are correctly filled.');
        }

        // The raw token only ever lived in the emailed link, only its hash is stored
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const redisKey = `password_reset:${tokenHash}`;
        const userId = await redis.get<number>(redisKey);

        if (!userId) {
            return sendStatus(res, 400, 'reset-link-invalid', 'Invalid or expired reset link.');
        }

        // Look up the real account rather than trusting the client-submitted email,
        // also needed to compare against the current password below
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return sendStatus(res, 400, 'reset-link-invalid', 'Invalid or expired reset link.');
        }

        const isSameAsOldPassword = await bcrypt.compare(new_password, user.passwordHash);
        if (isSameAsOldPassword) {
            return sendStatus(res, 400, 'password-same', 'New password must be different from your current password.');
        }

        const passwordHash = await bcrypt.hash(new_password, 10);
        // The reset link reached this inbox, which proves the address too, so an unconfirmed account counts as confirmed now
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash, tokenVersion: { increment: 1 }, ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date(), verifyDeadline: null }) }
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
            const from = `"Account Security" <${process.env.MAIL_FROM}>`;
            const to = user.email;
            const subject = 'Password reset successful';
            const message = `<p>Your password reset request has been completed successfully!</p>`;
            await sendEmail({ from, to, subject, message });
        } catch (error) {
            console.error('Failed to send password reset confirmation email:', error);
        }

        return sendStatus(res, 200, 'password-reset', 'Password has been reset successfully.');

    } catch (error) {
        return handleApiError(res, error, 'Server error in password recovery (redeem):');
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return recaptchaMiddleware(req, res, () => passwordRecoveryHandler(req, res));
}
