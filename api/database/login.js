import { prisma } from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
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

    try{
        const {email, password} = req.body;
        if(!RegexValidation(email, null, password, null, null, 'login')) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid input. Please ensure all fields are correctly filled.' 
            });
        }

        const user = await prisma.user.findUnique({
            where: {email: email}
        });
        if(!user){
            return res.status(400).json({ 
                success: false, 
                message: 'This user does not exist' 
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if(!passwordMatch){
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid password' 
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
        const userData = {id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName};
        return res.status(200).json({token: token, user: userData});
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