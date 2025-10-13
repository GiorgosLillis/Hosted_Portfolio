import { prisma } from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';
import { parse } from 'cookie';
import { serialize } from 'cookie';

const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const nameRegex = /^[a-zA-Z'-]{1,50}$/;

export async function checkToken(req) {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured on the server');
    }

    try {
        const cookies = parse(req.headers.cookie || '');
        const token = cookies.token;

        if (!token) {
            throw new Error('No token provided');
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId }
        });

        if (!user) {
            throw new Error('User specified in token not found');
        }
        return user;

    } catch (error) {
        throw new Error('Invalid or expired token.');
    }
}


export function RegexValidation(email, current_password, password, first_name, last_name, method) {

        switch(method) {
            case 'login':
                if (!email || !password) {
                    return false;
                }
                if (!email || !emailRegex.test(email)){
                    return false
                }
                if (!password || !passwordRegex.test(password)){
                    return false
                }
                return true;
            case 'register':
                if (!email || !password || !first_name || !last_name) {
                    return false;
                }
                if (!email || !emailRegex.test(email)){
                    return false
                }
                if (!password || !passwordRegex.test(password)){
                    return false
                }
                if (!first_name || !nameRegex.test(first_name)){
                    return false
                }
                if (!last_name || !nameRegex.test(last_name)){
                    return false
                }
                return true;

            case 'edit':
                if (!email && !password && !first_name && !last_name) {
                    return false;
                }
                if (email && typeof email !== 'string') return false;
                if (!current_password || typeof current_password !== 'string') return false;
                if (password && typeof password !== 'string') return false;
                if (first_name && typeof first_name !== 'string') return false;
                if (last_name && typeof last_name !== 'string') return false;

                if (email) {
                    if (!emailRegex.test(email)) {
                        return false;
                    }
                }

            
                if (!passwordRegex.test(current_password)) {
                    return false;
                }
                
                if (password) {
                    if (!passwordRegex.test(password)) {
                        return false;
                    }
                }
                
                if (first_name) {
                    if (!nameRegex.test(first_name)) {
                        return false;
                    }
                }
                
                if (last_name) {
                    if (!nameRegex.test(last_name)) {
                        return false;
                    }
                }
                return true;
            default:
                return false;
        }
}