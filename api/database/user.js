import { checkToken, setCorsHeaders } from './functions.js';
import { rateLimiter } from '../../lib/rateLimiter.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    try {
        const user = await checkToken(req);


        const userKey = `get_user_attempt:${user.id}`;
        const { allowed, ttl } = await rateLimiter(userKey, 30, 60); // 30 requests per minute

        if (!allowed) {
            res.setHeader('Retry-After', ttl);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please try again in ${ttl} seconds.`
            });
        }
      

        const userData = {
            id: user.id,
            email: user.email,
            first_name: user.firstName,
            last_name: user.lastName,
            created_at: user.createdAt
        };
        res.status(200).json({ user: userData });
    } catch (error) {
        res.status(401).json({ error: 'Not authenticated' });
    }
}