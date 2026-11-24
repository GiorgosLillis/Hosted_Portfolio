import { describe, it, expect, vi, beforeEach } from 'vitest';

const redis = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock('@upstash/redis', () => ({
    Redis: { fromEnv: () => redis },
}));

const { GET } = await import('./keep-alive.js');

const call = (headers = {}) => GET(new Request('https://example.com/api/keep-alive', { headers }));

beforeEach(() => {
    vi.clearAllMocks();
    redis.set.mockResolvedValue('OK');
});

describe('keep-alive', () => {
    it('answers 401 without the cron secret and does not touch Redis', async () => {
        const response = await call();

        expect(response.status).toBe(401);
        expect(redis.set).not.toHaveBeenCalled();
    });

    it('answers 401 with a wrong secret', async () => {
        const response = await call({ authorization: 'Bearer not-the-secret' });

        expect(response.status).toBe(401);
        expect(redis.set).not.toHaveBeenCalled();
    });

    it('pings Redis when called with the cron secret', async () => {
        const response = await call({ authorization: `Bearer ${process.env.CRON_SECRET}` });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ status: 'alive' });
        expect(redis.set).toHaveBeenCalledWith('keepalive', 'true');
    });

    it('still answers 200 and says so when Redis cannot be reached', async () => {
        redis.set.mockRejectedValue(new Error('Redis is down'));

        const response = await call({ authorization: `Bearer ${process.env.CRON_SECRET}` });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ status: 'redis unreachable' });
    });
});
