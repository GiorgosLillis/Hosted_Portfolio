import { prisma } from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';
import sanitizeHTML from '../../lib/sanitize.js';
import { checkToken, RegexValidation } from './functions.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: "Authorization token not provided." });
        }
        
        const user = await checkToken(token);
        const userId = user.id;

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


       
        updateData.email = email;
        if (password && password.trim() !== '') {
            updateData.passwordHash = await bcrypt.hash(password, 10);
        }

        if(first_name && first_name.trim() !== ''){
           updateData.firstName = sanitizeHTML(first_name);   
        }
        if(last_name && last_name.trim() !== ''){
            updateData.lastName = sanitizeHTML(last_name);   
        }
 
        Object.keys(updateData).forEach(key => {
            if (updateData[key] === undefined) {
                delete updateData[key];
            }
        });

        if (Object.keys(updateData).length === 0) {
             return res.status(400).json({ error: 'No data to update.' });
        }

        const dataToUpdate = {};
        if (password) dataToUpdate.password = password;
        if (email) dataToUpdate.email = email;
        if (first_name) dataToUpdate.firstName = first_name;
        if (last_name) dataToUpdate.lastName = last_name;
        
        const updatedUser = await prisma.user.update({
            where: {
                id: userId,
            },
            data: dataToUpdate,
        });

        return res.status(200).json({ 
            success: true,
            message: 'User updated successfully',
            token: token,
            email: updatedUser.email,
            first_name: updatedUser.firstName,
            last_name: updatedUser.lastName
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