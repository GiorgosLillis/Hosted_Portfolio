import { prisma } from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import sanitizeHTML from '../../lib/sanitize.js';
import { checkToken, RegexValidation, setAuthCookies, setCorsHeaders } from './functions.js';
import { rateLimiter } from '../../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../recaptcha.js';

const editUserHandler = async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'PUT') {
        return res.status(405).json({
            success: false,
            message: 'Only PUT requests are allowed'
        });
    }

    try {
        const user = await checkToken(req);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const userKey = `edit_user_attempt:${user.id}`;
        const { allowed, ttl } = await rateLimiter(userKey, 15, 60); // 15 requests per minute

        if (!allowed) {
            res.setHeader('Retry-After', ttl);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please try again in ${ttl} seconds.`
            });
        }

        const { email, current_password, password, first_name, last_name } = req.body;
        const updateData = {};


        if(!RegexValidation(email, current_password, password, first_name, last_name, 'edit')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input. Please ensure all fields are correctly filled.'
            });
        }

        const passwordMatch = await bcrypt.compare(current_password, user.passwordHash);
        if(!passwordMatch){
            return res.status(400).json({
                success: false,
                message: 'Invalid password'
            });
        }

        if (email) updateData.email = email;
        if (first_name) updateData.firstName = sanitizeHTML(first_name);
        if (last_name) updateData.lastName = sanitizeHTML(last_name);

        if (password) {
            updateData.passwordHash = await bcrypt.hash(password, 10);
        }

        if (Object.keys(updateData).length === 0) {
             return res.status(400).json({ error: 'No data to update.' });
        }

        const updatedUser = await prisma.user.update({
            where: {
                id: user.id,
            },
            data: updateData,
        });

        const token = jsonwebtoken.sign(
            {userId: user.id, email: updatedUser.email},
             process.env.JWT_SECRET,
            {expiresIn: '7d'}
        );

        setAuthCookies(res, token);

        return res.status(200).json({
            success: true,
            message: 'User updated successfully',
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                first_name: updatedUser.firstName,
                last_name: updatedUser.lastName
            }
        });

    } catch (error) {
        // Differentiate between auth errors and other server errors
        console.error('Server error on edit:', error);
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
    recaptchaMiddleware(req, res, () => editUserHandler(req, res));
}