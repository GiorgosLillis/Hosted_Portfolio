import { prisma } from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import { RegexValidation, setAuthCookies, setCorsHeaders} from './functions.js';
import { rateLimiter } from '../../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../recaptcha.js';

const loginHandler = async (req, res) => {
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
        const { email, password } = req.body;

     
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const ipKey = `login_attempt_ip:${ip}`;
        const usernameKey = `login_attempt_username:${email}`;

        const [ipResult, usernameResult] = await Promise.all([
            rateLimiter(ipKey, 5, 300), // 5 attempts per 5 minutes for IP
            rateLimiter(usernameKey, 5, 900) // 5 attempts per 15 minutes for username
        ]);

        if (!ipResult.allowed || !usernameResult.allowed) {
            const ttl = Math.max(ipResult.ttl, usernameResult.ttl);
            res.setHeader('Retry-After', ttl);
            return res.status(429).json({
                success: false,
                message: `Too many login attempts. Please try again in ${ttl} seconds.`
            });
        }


        if(!RegexValidation(email, null, password, null, null, 'login')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input. Please ensure all fields are correctly filled.'
            });
        }

        const user = await prisma.user.findUnique({
            where: {email: email}
        });

        const passwordMatch = user ? await bcrypt.compare(password, user.passwordHash) : false;

        if(!user || !passwordMatch){
            // Important: Do not reveal which field was incorrect.
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
        await prisma.user.update({
            where: {id: user.id},
            data: {lastLoginAt: new Date()}
        });
        const token = jsonwebtoken.sign(
            {userId: user.id, email: user.email},
            process.env.JWT_SECRET,
            {expiresIn: '7d'}
        );

        setAuthCookies(res, token);

        const userData = {id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName};
        return res.status(200).json({user: userData});
    }
    catch(error){

        console.error('Error during login:', error);
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred',
            error: process.env.NODE_ENV === 'development' ? error.message : null
        });


    }
}

export default async function handler(req, res) {
    recaptchaMiddleware(req, res, () => loginHandler(req, res));
}