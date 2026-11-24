import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRes } from '../testUtils/mockReqRes.js';

vi.mock('./rateLimiter.js', () => ({
    rateLimiter: vi.fn(),
}));

const { rateLimiter } = await import('./rateLimiter.js');
const { enforceRateLimits } = await import('./http.js');

beforeEach(() => {
    vi.clearAllMocks();
});

describe('enforceRateLimits', () => {
    it('lets the request through when every limit allows it, without touching the response', async () => {
        rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
        const res = createMockRes();

        expect(await enforceRateLimits(res, ['ip:1', 5, 60], ['user:1', 3, 600])).toBe(true);
        expect(rateLimiter).toHaveBeenCalledWith('ip:1', 5, 60);
        expect(rateLimiter).toHaveBeenCalledWith('user:1', 3, 600);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('sends one 429 with the longest wait among the limits that were exceeded', async () => {
        rateLimiter
            .mockResolvedValueOnce({ allowed: false, ttl: 30 })
            .mockResolvedValueOnce({ allowed: true, ttl: 0 })
            .mockResolvedValueOnce({ allowed: false, ttl: 900 });
        const res = createMockRes();

        expect(await enforceRateLimits(res, ['a', 1, 60], ['b', 1, 60], ['c', 1, 900])).toBe(false);
        expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 900);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'rate-limited', ttl: 900 }));
    });

    it('works the same with a single limit', async () => {
        rateLimiter.mockResolvedValue({ allowed: false, ttl: 12 });
        const res = createMockRes();

        expect(await enforceRateLimits(res, ['only', 2, 60])).toBe(false);
        expect(rateLimiter).toHaveBeenCalledWith('only', 2, 60);
        expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 12);
    });
});
