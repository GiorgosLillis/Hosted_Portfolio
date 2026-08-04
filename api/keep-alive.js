import { Redis } from '@upstash/redis';

export async function GET() {
    const redis = Redis.fromEnv();
    try {
        await redis.set('keepalive', 'true');
        return Response.json({ status: 'alive' });
    } catch (error) {
        console.error('Keep-alive ping to Redis failed:', error);
        return Response.json({ status: 'redis unreachable' }, { status: 200 });
    }
}