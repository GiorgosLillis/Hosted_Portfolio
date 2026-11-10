import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import { isValidEmail, isValidPassword, isValidName, setAuthCookies, setCorsHeaders, getClientIp, sendStatus } from '../lib/functions.js';
import sanitizeHTML from '../lib/sanitize.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// POST only, creates a new account
const registerHandler = async (req: VercelRequest, res: VercelResponse) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return sendStatus(res, 405, 'method-not-allowed', 'Only POST requests are allowed');
    }

    try {

        const { email, password, first_name, last_name } = req.body;
        const ip = getClientIp(req);
        const ipKey = `register_attempt_ip:${ip}`;
        const emailKey = `register_attempt_email:${email}`;

        const [ipResult, emailResult] = await Promise.all([
            rateLimiter(ipKey, 5, 600),      // Limit: 5 registration attempts per IP every 10 minutes
            rateLimiter(emailKey, 3, 1800)   // Limit: 3 registration attempts per email every 30 minutes
        ]);

        if (!ipResult.allowed || !emailResult.allowed) {
            const ttl = Math.max(ipResult.ttl, emailResult.ttl);
            res.setHeader('Retry-After', ttl);
            return sendStatus(res, 429, 'rate-limited', `Too many registration attempts. Please try again in ${ttl} seconds.`, { ttl: ttl });
        }

        if (!process.env.JWT_SECRET) {
            return sendStatus(res, 500, 'server-misconfigured', 'JWT secret is not configured on the server');
        }

        // Check if fields are in valid format
        if (!isValidEmail(email) || !isValidPassword(password) || !isValidName(first_name) || !isValidName(last_name)) {
            return sendStatus(res, 400, 'invalid-input', 'Invalid input. Please ensure all fields are correctly filled.');
        }

        // Strip any HTML/script content from user-supplied names
        const safeFirstName = sanitizeHTML(first_name);
        const safeLastName = sanitizeHTML(last_name);

        // No duplicate accounts for the same email
        const existingUser = await prisma.user.findUnique({
            where: { email: email }
        });
        if (existingUser) {
            return sendStatus(res, 400, 'email-exists', "User with this email already exists");
        }

        // Hash the password 
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                email: email,
                passwordHash: hashedPassword,
                firstName: safeFirstName,
                lastName: safeLastName,
                tokenVersion: 0,
                lastLoginAt: new Date()
            }
        });

        // Sign the user in right away, no email verification step
        const token = jsonwebtoken.sign(
            { userId: newUser.id, email: newUser.email, tokenVersion: newUser.tokenVersion },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        setAuthCookies(res, token);

        const userData = { id: newUser.id, email: newUser.email, firstName: newUser.firstName, lastName: newUser.lastName, createdAt: newUser.createdAt };
        return res.status(200).json({ success: true, user: userData });

    } catch (error) {
        console.error('Server error on register:', error);
        return sendStatus(res, 500, 'server-error', 'An unexpected error occurred', { error: process.env.NODE_ENV === 'development' ? (error as { message?: string }).message : undefined });
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    return recaptchaMiddleware(req, res, () => registerHandler(req, res));
}