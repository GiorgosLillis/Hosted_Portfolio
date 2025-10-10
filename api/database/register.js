import { prisma } from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import sanitizeHTML from '../../lib/sanitize.js';
import { RegexValidation } from './functions.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
            return res.status(400).json({ error: 'User already exists' });
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

        const userData = {id: newUser.id, email: newUser.email, firstName: newUser.firstName, lastName: newUser.lastName};
        return res.status(200).json({token: token, user: userData});

    } catch (error) {
        console.error('Server error on register:', error);
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}