import { prisma } from './prisma.js';
import jwt from 'jsonwebtoken';
import { parse, serialize } from 'cookie';
import { Redis } from '@upstash/redis';
import { rateLimiter } from './rateLimiter.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { User } from '@prisma/client';

const redis = Redis.fromEnv();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_+;':",./?-])[A-Za-z\d@$!%*?&#^_+;':",./?-]{8,}$/;
const nameRegex = /^[a-zA-Z'-]{1,50}$/;

// Bounds a call to an upstream API so a hung third party can't hang function indefinitely
export async function fetchWithTimeout(url: string, timeoutMs = 8000, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Upstream service timed out.');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

export function getClientIp(req: VercelRequest): string {
    return (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
}

// Runs a rate-limit check and sends the 429 itself if exceeded. Returns whether the caller should continue.
export async function enforceRateLimit(res: VercelResponse, key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const { allowed, ttl } = await rateLimiter(key, limit, windowSeconds);
    if (!allowed) {
        res.setHeader('Retry-After', ttl);
        res.status(429).json({ success: false, message: `Too many requests. Please try again in ${ttl} seconds.` });
    }
    return allowed;
}

// Standard catch-all for handler try/catch blocks: auth errors become 401, everything else a generic 500
export function handleApiError(res: VercelResponse, error: unknown, context: string) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Invalid or expired token.' || message === 'Not authenticated') {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    console.error(context, error);
    return res.status(500).json({
        success: false,
        message: 'An unexpected error occurred',
        error: process.env.NODE_ENV === 'development' ? message : undefined
    });
}

export function setCorsHeaders(res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
}

interface DecodedToken {
    userId: number;
    email: string;
    tokenVersion: number;
}

// Reads the auth cookie, verifies the JWT and returns the logged-in user
export async function checkToken(req: VercelRequest): Promise<User> {
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
        decoded = jwt.verify(token, process.env.JWT_SECRET) as DecodedToken;
    } catch {
        throw new Error('Invalid or expired token.');
    }

    const cacheKey = `user_session:${decoded.userId}`;

    // Try the cached user first to avoid a DB round trip
    let cachedUser: User | null = null;
    try {
        cachedUser = await redis.get<User>(cacheKey);
    } catch (error) {
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
export function isValidEmail(email?: string | null): boolean {
    return !!email && emailRegex.test(email);
}

export function isValidPassword(password?: string | null): boolean {
    return !!password && passwordRegex.test(password);
}

export function isValidName(name?: string | null): boolean {
    return !!name && nameRegex.test(name);
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
