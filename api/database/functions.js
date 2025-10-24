import { prisma } from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';
import { parse } from 'cookie';
import { serialize } from 'cookie';


const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_+;':",./?-])[A-Za-z\d@$!%*?&#^_+;':",./?-]{8,}$/;
const nameRegex = /^[a-zA-Z'-]{1,50}$/;

export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
}

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
                if (!emailRegex.test(email) || !passwordRegex.test(password)){
                    return false
                }
                return true;
            case 'register':
                if (!email || !password || !first_name || !last_name) {
                    return false;
                }
                if (!emailRegex.test(email) || !passwordRegex.test(password) || !nameRegex.test(first_name) || !nameRegex.test(last_name)){
                    return false
                }
                return true;

            case 'edit':
                if (email && !emailRegex.test(email)) {
                    return false;
                }
                if (password && !passwordRegex.test(password)) {
                    return false;
                }
                if (first_name && !nameRegex.test(first_name)) {
                    return false;
                }
                if (last_name && !nameRegex.test(last_name)) {
                    return false;
                }
                if (current_password && !passwordRegex.test(current_password)){
                    return false;
                }
                return true;
            case 'delete':
                 if (!password || !passwordRegex.test(password)){
                    return false
                }
                return true;
            default:
                return false;
        }
}

const COOKIE_OPTIONS = {
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'strict',
    path: '/'
};

export function setAuthCookies(res, token) {
    const tokenCookie = serialize('token', token, { 
        ...COOKIE_OPTIONS,
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    const sessionActiveCookie = serialize('session-active', 'true', {
        ...COOKIE_OPTIONS,
        maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    res.setHeader('Set-Cookie', [tokenCookie, sessionActiveCookie]);
}

export function clearAuthCookies(res) {
    const tokenCookie = serialize('token', '', { 
        ...COOKIE_OPTIONS,
        httpOnly: true,
        expires: new Date(0),
    });

    const sessionActiveCookie = serialize('session-active', '', {
        ...COOKIE_OPTIONS,
        expires: new Date(0),
    });

    res.setHeader('Set-Cookie', [tokenCookie, sessionActiveCookie]);
}