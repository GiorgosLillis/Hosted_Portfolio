import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

/**
 * @param {string} key - A unique identifier (e.g., user ID or IP address)
 * @param {number} limit - Max requests allowed
 * @param {number} windowInSeconds - Time window for the limit
 * @returns {Promise<{allowed: boolean, ttl: number}>} - An object with the allowed status and the remaining TTL
 */

export async function rateLimiter(key, limit, windowInSeconds) {
    const redisKey = `rate_limit:${key}`;

    // 1. Increment the counter for the key
    const currentCount = await redis.incr(redisKey);

    // 2. Set the expiration time if this is the first request in the window
    if (currentCount === 1) {
        await redis.expire(redisKey, windowInSeconds);
    }

    // 3. Check the limit
    const isAllowed = currentCount <= limit;

    if (!isAllowed) {
        const ttl = await redis.ttl(redisKey);
        return { allowed: false, ttl };
    }

    return { allowed: true, ttl: 0 };
}