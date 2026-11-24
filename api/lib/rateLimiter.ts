import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export interface RateLimitResult {
    allowed: boolean;
    ttl: number;
}

// Counts and sets the expiry in one atomic step. A key that somehow has no expiry (TTL < 0) gets one, so it can't block forever.
const COUNT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

// Fixed-window counter in Redis, one key per identifier (IP, email, user id, etc.)
export async function rateLimiter(key: string, limit: number, windowInSeconds: number): Promise<RateLimitResult> {
    const redisKey = `rate_limit:${key}`;

    try {
        const currentCount = Number(await redis.eval(COUNT_SCRIPT, [redisKey], [windowInSeconds]));

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
