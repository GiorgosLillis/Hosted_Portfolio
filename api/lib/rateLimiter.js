import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

/**
 * @param {string} key - A unique identifier (e.g., user ID or IP address)
 * @param {number} limit - Max requests allowed
 * @param {number} windowInSeconds - Time window for the limit
 * @returns {Promise<{allowed: boolean, ttl: number}>} - An object with the allowed status and the remaining TTL
 */

// Fixed-window counter in Redis, one key per identifier (IP, email, user id, etc.)
export async function rateLimiter(key, limit, windowInSeconds) {
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