import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export interface RateLimitResult {
    allowed: boolean;
    ttl: number;
}

// Fixed-window counter in Redis, one key per identifier (IP, email, user id, etc.)
export async function rateLimiter(key: string, limit: number, windowInSeconds: number): Promise<RateLimitResult> {
    const redisKey = `rate_limit:${key}`;

    try {
        const currentCount = await redis.incr(redisKey);

        if (currentCount === 1) {
            await redis.expire(redisKey, windowInSeconds);
        }

        const isAllowed = currentCount <= limit;

        if (!isAllowed) {
            const ttl = await redis.ttl(redisKey);
            return { allowed: false, ttl };
        }

        return { allowed: true, ttl: 0 };
    } catch (error) {
        console.log("Rate limiter error (Redis unavaiable), allowing request. Error: ", error);
        return { allowed: true, ttl: 0 };
    }
}
