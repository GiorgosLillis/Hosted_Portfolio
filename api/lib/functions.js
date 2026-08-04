import { prisma } from './prisma.js';
import jwt from 'jsonwebtoken';
import { parse } from 'cookie';
import { serialize } from 'cookie';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();


const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_+;':",./?-])[A-Za-z\d@$!%*?&#^_+;':",./?-]{8,}$/;
const nameRegex = /^[a-zA-Z'-]{1,50}$/;


export function getClientIp(req) {
    return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
}

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

// Reads the auth cookie, verifies the JWT and returns the logged-in user
export async function checkToken(req) {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured on the server');
    }


    const cookies = parse(req.headers.cookie || '');
    const token = cookies.token;

    if (!token) {
        throw new Error('Invalid or expired token.');
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        throw new Error('Invalid or expired token.');
    }

    const cacheKey = `user_session:${decoded.userId}`;

    // Try the cached user first to avoid a DB round trip
    let cachedUser = null;
    try {
        cachedUser = await redis.get(cacheKey);

    }
    catch (error) {
        console.error('Redis read failed in checkToken, falling back to DB:', error);
    }
    if (cachedUser) {
        if (decoded.tokenVersion !== cachedUser.tokenVersion) {
            throw new Error('Invalid or expired token.');
        }
        return cachedUser;
    }

    const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
    });

    if (!user) {
        throw new Error('User specified in token not found');
    }

    if (decoded.tokenVersion !== user.tokenVersion) {
        throw new Error('Invalid or expired token.');
    }

    try {
        await redis.set(cacheKey, user, { ex: 300 });
    } catch (error) {
        console.error('Redis write failed in checkToken, continuing without cache:', error);
    }

    return user;

}

// Format checks 
export function isValidEmail(email) {
    return !!email && emailRegex.test(email);
}

export function isValidPassword(password) {
    return !!password && passwordRegex.test(password);
}

export function isValidName(name) {
    return !!name && nameRegex.test(name);
}

const COOKIE_OPTIONS = {
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'strict',
    path: '/'
};

// Sets the real JWT (httpOnly, never readable by JS) plus a plain flag cookie the frontend can check
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

// Logout, wipes both cookies by setting them to expire immediately
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