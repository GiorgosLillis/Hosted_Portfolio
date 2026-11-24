import { describe, it, expect, vi, beforeEach } from 'vitest';

const redis = vi.hoisted(() => ({ eval: vi.fn(), ttl: vi.fn() }));

vi.mock('@upstash/redis', () => ({
    Redis: { fromEnv: () => redis },
}));

const { rateLimiter } = await import('./rateLimiter.js');

beforeEach(() => {
    vi.clearAllMocks();
    redis.eval.mockResolvedValue(1);
    redis.ttl.mockResolvedValue(42);
});

describe('rateLimiter', () => {
    it('counts and sets the expiry in one atomic script, never as two separate calls', async () => {
        await rateLimiter('login_attempt_ip:1.2.3.4', 5, 300);

        expect(redis.eval).toHaveBeenCalledTimes(1);
        const [script, keys, args] = redis.eval.mock.calls[0];
        expect(keys).toEqual(['rate_limit:login_attempt_ip:1.2.3.4']);
        expect(args).toEqual([300]);
        // A key that has no expiry gets one, so it can't block forever
        expect(script).toContain('INCR');
        expect(script).toContain('TTL');
        expect(script).toContain('EXPIRE');
    });

    it('allows requests up to and including the limit', async () => {
        for (const count of [1, 4, 5]) {
            redis.eval.mockResolvedValue(count);
            await expect(rateLimiter('key', 5, 60)).resolves.toEqual({ allowed: true, ttl: 0 });
        }
    });

    it('blocks above the limit and reports how long is left', async () => {
        redis.eval.mockResolvedValue(6);

        await expect(rateLimiter('key', 5, 60)).resolves.toEqual({ allowed: false, ttl: 42 });
        expect(redis.ttl).toHaveBeenCalledWith('rate_limit:key');
    });

    it('allows the request when Redis is unavailable', async () => {
        redis.eval.mockRejectedValue(new Error('Redis is down'));

        await expect(rateLimiter('key', 5, 60)).resolves.toEqual({ allowed: true, ttl: 0 });
    });
});
