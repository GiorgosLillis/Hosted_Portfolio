import { rateLimiter } from './rateLimiter.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Request and response helpers. The only package they load is Redis (for the rate limit), never the database or JWT code,
// so a handler that only needs these (the contact form) stays light. functions.ts re-exports them for the handlers that import from there.

export function getClientIp(req: VercelRequest): string {
    return (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
}

// Every API response with a status message goes through here: a stable `code` the client translates,
// the English `message` as fallback, and any extra fields (e.g. ttl for rate limits) merged in flat
export function sendStatus(res: VercelResponse, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    return res.status(status).json({ success: status < 400, code, message, ...extra });
}

export type RateLimit = [key: string, limit: number, windowSeconds: number];

// Checks every limit together (e.g. per IP and per user) and sends one 429 with the longest wait if any is exceeded.
// Returns whether the caller should continue.
export async function enforceRateLimits(res: VercelResponse, ...limits: RateLimit[]): Promise<boolean> {
    const results = await Promise.all(limits.map(([key, limit, windowSeconds]) => rateLimiter(key, limit, windowSeconds)));
    const blocked = results.filter((result) => !result.allowed);
    if (blocked.length === 0) {
        return true;
    }
    const ttl = Math.max(...blocked.map((result) => result.ttl));
    res.setHeader('Retry-After', ttl);
    sendStatus(res, 429, 'rate-limited', `Too many requests. Please try again in ${ttl} seconds.`, { ttl: ttl });
    return false;
}

export function handleApiError(res: VercelResponse, error: unknown, context: string) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Invalid or expired token.' || message === 'Not authenticated') {
        return sendStatus(res, 401, 'not-authenticated', 'Not authenticated');
    }
    console.error(context, error);
    return sendStatus(res, 500, 'server-error', 'An unexpected error occurred', { error: process.env.NODE_ENV === 'development' ? message : undefined });
}

export function setCorsHeaders(res: VercelResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
}

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
