import { prisma } from '../lib/prisma.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { checkToken, setAuthCookies, setCorsHeaders, getClientIp } from '../lib/functions.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';

const ExportHandler = async (req, res) => {

    setCorsHeaders(res);

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
        if (!user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const ip = getClientIp(req);
        const ipCheck = await rateLimiter(`export_attempt_ip:${ip}`, 20, 60); // 20 requests per minute per IP
        if (!ipCheck.allowed) {
            res.setHeader('Retry-After', ipCheck.ttl);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please try again in ${ipCheck.ttl} seconds.`
            });
        }

        const userKey = `export_attempt:${user.id}`;
        const { allowed, ttl } = await rateLimiter(userKey, 10, 60); // 10 requests per minute

        if (!allowed) {
            res.setHeader('Retry-After', ttl);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please try again in ${ttl} seconds.`
            });
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

export default async function handler(req, res) {
    return recaptchaMiddleware(req, res, () => ExportHandler(req, res));
}