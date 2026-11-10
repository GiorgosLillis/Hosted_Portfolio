import { prisma } from '../lib/prisma.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { checkToken, setCorsHeaders, getClientIp, handleApiError, sendStatus } from '../lib/functions.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ExportHandler = async (req: VercelRequest, res: VercelResponse) => {

    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'GET') {
        return sendStatus(res, 405, 'method-not-allowed', 'Only GET requests are allowed');
    }

    try {
        // Check user token validation
        const user = await checkToken(req);
        if (!user) {
            return sendStatus(res, 401, 'not-authenticated', 'Not authenticated');
        }

        const ip = getClientIp(req);
        const ipCheck = await rateLimiter(`export_attempt_ip:${ip}`, 20, 60); // 20 requests per minute per IP
        if (!ipCheck.allowed) {
            res.setHeader('Retry-After', ipCheck.ttl);
            return sendStatus(res, 429, 'rate-limited', `Too many requests. Please try again in ${ipCheck.ttl} seconds.`, { ttl: ipCheck.ttl });
        }

        const userKey = `export_attempt:${user.id}`;
        const { allowed, ttl } = await rateLimiter(userKey, 10, 60); // 10 requests per minute

        if (!allowed) {
            res.setHeader('Retry-After', ttl);
            return sendStatus(res, 429, 'rate-limited', `Too many requests. Please try again in ${ttl} seconds.`, { ttl: ttl });
        }

        // Wait for all the search queries to complete and return one cities and one shopping list
        const [favoriteCities, shoppingList] = await Promise.all([
            prisma.city.findMany({
                where: { userId: user.id },
                select: { name: true, country: true, latitude: true, longitude: true }
            }),
            prisma.userShoppingListItem.findMany({
                where: { userId: user.id },
                select: { category: true, name: true, quantity: true, measure: true, isPurchased: true }
            })
        ]);

        return res.status(200).json({
            success: true,
            data: {
                profile: {
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    createdAt: user.createdAt
                },
                favoriteCities,
                shoppingList
            }
        });
    } catch (error) {
        return handleApiError(res, error, 'Server error in export:');
    }
}

export default ExportHandler;
