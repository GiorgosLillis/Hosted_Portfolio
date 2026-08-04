import { checkToken, setCorsHeaders } from '../lib/functions.js';
import { rateLimiter } from '../lib/rateLimiter.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    // GET only valid method
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            message: 'Only GET requests are allowed'
        });
    }

    try {
        // Check user token validation
        const user = await checkToken(req);
        const userKey = `get_user_attempt:${user.id}`;

        // Rate limiting using user id as a key
        const { allowed, ttl } = await rateLimiter(userKey, 30, 60); // 30 requests per minute
        if (!allowed) {
            res.setHeader('Retry-After', ttl);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please try again in ${ttl} seconds.`
            });
        }

        // Return user data
        const userData = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            createdAt: user.createdAt
        };
        res.status(200).json({ user: userData });
    } catch (error) {
        res.status(401).json({ error: 'Not authenticated' });
    }
}