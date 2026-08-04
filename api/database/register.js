import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import { isValidEmail, isValidPassword, isValidName, setAuthCookies, setCorsHeaders, getClientIp } from '../lib/functions.js';
import sanitizeHTML from '../lib/sanitize.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';

// POST only, creates a new account
const registerHandler = async (req, res) => {
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
            return res.status(429).json({
                success: false,
                message: `Too many registration attempts. Please try again in ${ttl} seconds.`
            });
        }


        // Check if fields are in valid format
        if (!isValidEmail(email) || !isValidPassword(password) || !isValidName(first_name) || !isValidName(last_name)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input. Please ensure all fields are correctly filled.'
            });
        }

        // Strip any HTML/script content from user-supplied names
        const safeFirstName = sanitizeHTML(first_name);
        const safeLastName = sanitizeHTML(last_name);

        // No duplicate accounts for the same email
        const existingUser = await prisma.user.findUnique({
            where: { email: email }
        });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User with this email already exists"
            });
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

        const userData = { id: newUser.id, email: newUser.email, firstName: newUser.firstName, lastName: newUser.lastName };
        return res.status(200).json({ user: userData });

    } catch (error) {
        console.error('Server error on register:', error);
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export default async function handler(req, res) {
    return recaptchaMiddleware(req, res, () => registerHandler(req, res));
}