import axios from 'axios';
import 'dotenv/config';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendStatus } from './functions.js';

interface RecaptchaResult {
    success: boolean;
    score: number;
    action: string;
    errors: string[];
}

// Calls Google's siteverify endpoint and returns the success/score for the given token
export async function verifyRecaptcha(token: string): Promise<RecaptchaResult> {
    if (!token) {
        throw new Error('reCAPTCHA token is required');
    }

    try {
        const response = await axios.post(
            'https://www.google.com/recaptcha/api/siteverify',
            new URLSearchParams({
                secret: process.env.RECAPTCHA_SECRET_KEY ?? '',
                response: token
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 3000
            }
        );

        return {
            success: response.data.success,
            score: response.data.score,
            action: response.data.action,
            errors: response.data['error-codes'] || []
        };
    } catch (error) {
        console.error('reCAPTCHA verification error:', error);
        throw new Error('Failed to verify reCAPTCHA');
    }
}

// Gate for mutating routes, blocks the request before it reaches the real handler if the token is missing/bad/low-score
export async function recaptchaMiddleware(req: VercelRequest, res: VercelResponse, next: () => unknown) {
    const recaptchaToken = req.body?.['g-recaptcha-response'] || req.headers['g-recaptcha-response'];

    if (!recaptchaToken) {
        return sendStatus(res, 400, 'recaptcha-missing', 'reCAPTCHA token is required');
    }

    try {
        const { success, score, errors } = await verifyRecaptcha(recaptchaToken);

        if (!success) {
            return sendStatus(res, 403, 'recaptcha-failed', 'reCAPTCHA verification failed!', { errors });
        }

        // Below 0.5 is treated as a bot by Google's own scoring guidance
        if (score < 0.5) {
            return sendStatus(res, 403, 'recaptcha-low-score', 'reCAPTCHA score too low, suspected bot.', { score });
        }

        next();
    } catch (error) {
        console.error('reCAPTCHA middleware error:', error);
        return sendStatus(res, 500, 'recaptcha-error', 'An unexpected error occurred during reCAPTCHA verification');
    }
}
