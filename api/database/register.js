import { prisma } from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import { RegexValidation, setAuthCookies, setCorsHeaders  } from './functions.js';
import sanitizeHTML from '../../lib/sanitize.js';
import { rateLimiter } from '../../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../recaptcha.js';

const registerHandler = async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        // Handle preflight request
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

       
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
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
      

        if(!RegexValidation(email, null, password, first_name, last_name, 'register')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input. Please ensure all fields are correctly filled.'
            });
        }

        const safeFirstName = sanitizeHTML(first_name);
        const safeLastName = sanitizeHTML(last_name);

        const existingUser = await prisma.user.findUnique({
            where: { email: email }
        });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User with this email already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
            email: email,
            passwordHash: hashedPassword,
            firstName: safeFirstName,
            lastName: safeLastName,
            lastLoginAt: new Date()
            }
        });

        const token = jsonwebtoken.sign(
            { userId: newUser.id, email: newUser.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        setAuthCookies(res, token);

        const userData = {id: newUser.id, email: newUser.email, firstName: newUser.firstName, lastName: newUser.lastName};
        return res.status(200).json({user: userData});

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
    recaptchaMiddleware(req, res, () => registerHandler(req, res));
}