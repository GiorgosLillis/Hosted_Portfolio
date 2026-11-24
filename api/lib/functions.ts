import { prisma } from './prisma.js';
import jwt from 'jsonwebtoken';
import { parse, serialize } from 'cookie';
import { Redis } from '@upstash/redis';
import { getClientIp, sendStatus, enforceRateLimits, handleApiError, setCorsHeaders, fetchWithTimeout } from './http.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { User } from '@prisma/client';

// Re-exported so handlers keep importing everything from one place
export { getClientIp, sendStatus, enforceRateLimits, handleApiError, setCorsHeaders, fetchWithTimeout };

const redis = Redis.fromEnv();

// The logged-in user as handlers and the Redis session cache see it: never with the password hash
export type SessionUser = Omit<User, 'passwordHash'>;

interface DecodedToken {
    userId: number;
    email: string;
    tokenVersion: number;
}

// Reads the auth cookie, verifies the JWT and returns the logged-in user
export async function checkToken(req: VercelRequest): Promise<SessionUser> {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured on the server');
    }

    const cookies = parse(req.headers.cookie || '');
    const token = cookies.token;

    if (!token) {
        throw new Error('Invalid or expired token.');
    }

    let decoded: DecodedToken;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }) as DecodedToken;
    } catch {
        throw new Error('Invalid or expired token.');
    }

    const cacheKey = `user_session:${decoded.userId}`;

    // Try the cached user first to avoid a DB round trip
    let cachedUser: SessionUser | null = null;
    try {
        cachedUser = await redis.get<SessionUser>(cacheKey);
    } catch (error) {
        console.error('Redis read failed in checkToken, falling back to DB:', error);
    }
    // A session from before email verification existed stops working until that account confirms its address
    if (cachedUser) {
        if (decoded.tokenVersion !== cachedUser.tokenVersion || !cachedUser.emailVerifiedAt) {
            throw new Error('Invalid or expired token.');
        }
        return cachedUser;
    }

    const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
    });

    if (!user) {
        throw new Error('Invalid or expired token.');
    }

    if (decoded.tokenVersion !== user.tokenVersion || !user.emailVerifiedAt) {
        throw new Error('Invalid or expired token.');
    }

    // Keep the password hash out of the cache and out of every handler, the two that need it read it from the database
    const { passwordHash, ...sessionUser } = user;

    try {
        await redis.set(cacheKey, sessionUser, { ex: 300 });
    } catch (error) {
        console.error('Redis write failed in checkToken, continuing without cache:', error);
    }

    return sessionUser;
}

const COOKIE_OPTIONS = {
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'strict' as const,
    path: '/'
};

// Sets the real JWT (httpOnly, never readable by JS) plus a plain flag cookie the frontend can check
export function setAuthCookies(res: VercelResponse, token: string) {
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
export function clearAuthCookies(res: VercelResponse) {
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
