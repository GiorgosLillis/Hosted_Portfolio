import { Redis } from '@upstash/redis';

export async function GET() {
    const redis = Redis.fromEnv();
    await redis.set('keepalive', 'true');
    return Response.json({ status: 'alive' });
}