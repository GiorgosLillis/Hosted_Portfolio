import { prisma } from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { checkToken, clearAuthCookies, RegexValidation, setCorsHeaders } from './functions.js';
import { rateLimiter } from '../../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../recaptcha.js';

const deleteUserHandler = async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'DELETE') {
        return res.status(405).json({
            success: false,
            message: 'Only DELETE requests are allowed'
        });
    }

    try {
        const user = await checkToken(req);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const userKey = `delete_user_attempt:${user.id}`;
        const { allowed, ttl } = await rateLimiter(userKey, 3, 3600); // 3 requests per hour

        if (!allowed) {
            res.setHeader('Retry-After', ttl);
            return res.status(429).json({
                success: false,
                message: `Too many delete requests. Please try again in ${ttl} seconds.`
            });
        }

        const { password } = req.body;
        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required for account deletion.'
            });
        }

        if(!RegexValidation(null, null, password, null, null, 'delete')){
             return res.status(400).json({ 
                success: false,
                message: 'Invalid password.' 
            });
        }

 
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password.'
            });
        }

        await prisma.user.delete({
            where: {
                id: user.id,
            },
        });

        clearAuthCookies(res);

        return res.status(200).json({
            success: true,
            message: 'Account deleted successfully.'
        });

    } catch (error) {
        console.error('Server error on delete:', error);
        if (error.code === 'P2025') { 
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export default async function handler(req, res) {
    recaptchaMiddleware(req, res, () => deleteUserHandler(req, res));
}