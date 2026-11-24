import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';

// Vercel's cron sends "Authorization: Bearer <CRON_SECRET>", without this check anyone could call the endpoint and spend Redis commands
function isFromCron(request) {
    const secret = process.env.CRON_SECRET;
    const authorization = request.headers.get('authorization');
    if (!secret || !authorization) {
        return false;
    }
    const digest = (value) => crypto.createHash('sha256').update(value).digest();
    return crypto.timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

export async function GET(request) {
    if (!isFromCron(request)) {
        return Response.json({ status: 'not authenticated' }, { status: 401 });
    }

    const redis = Redis.fromEnv();
    try {
        await redis.set('keepalive', 'true');
        return Response.json({ status: 'alive' });
    } catch (error) {
        console.error('Keep-alive ping to Redis failed:', error);
        return Response.json({ status: 'redis unreachable' }, { status: 200 });
    }
}
