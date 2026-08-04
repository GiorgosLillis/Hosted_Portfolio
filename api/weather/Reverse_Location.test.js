import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';

vi.mock('../lib/functions.js', () => ({
    setCorsHeaders: vi.fn(),
    getClientIp: vi.fn((req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress),
}));

vi.mock('../lib/rateLimiter.js', () => ({
    rateLimiter: vi.fn().mockResolvedValue({ allowed: true, ttl: 0 }),
}));

const { rateLimiter } = await import('../lib/rateLimiter.js');
const reverseLocationHandler = (await import('./Reverse_Location.js')).default;

const mockOsmResult = {
    address: {
        country: 'Greece',
        country_code: 'gr',
        city: 'Athens',
    },
};

function stubFetchSuccess(data = mockOsmResult) {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
}

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    stubFetchSuccess();
});

describe('Reverse_Location handler', () => {
    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await reverseLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects when rate limited with 429', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 30 });
        const req = createMockReq({ body: { lat: 37.9, lon: 23.7 } });
        const res = createMockRes();
        await reverseLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('rejects an invalid latitude with 400', async () => {
        const req = createMockReq({ body: { lat: 999, lon: 23.7 } });
        const res = createMockRes();
        await reverseLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects an invalid longitude with 400', async () => {
        const req = createMockReq({ body: { lat: 37.9, lon: -999 } });
        const res = createMockRes();
        await reverseLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns formatted location data on a successful lookup', async () => {
        const req = createMockReq({ body: { lat: 11.1, lon: 21.1 } });
        const res = createMockRes();
        await reverseLocationHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            country_name: 'Greece',
            country: 'GR',
            city: 'Athens',
        });
    });

    it('propagates an upstream error status', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({ error: 'Service unavailable' }),
        });
        const req = createMockReq({ body: { lat: 11.2, lon: 21.2 } });
        const res = createMockRes();
        await reverseLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(503);
    });

    it('returns 500 when the upstream call throws', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
        const req = createMockReq({ body: { lat: 11.3, lon: 21.3 } });
        const res = createMockRes();
        await reverseLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('uses the x-forwarded-for header for the rate-limit key, not req.ip', async () => {
        const req = createMockReq({ body: { lat: 11.4, lon: 21.4 }, headers: { 'x-forwarded-for': '5.6.7.8' } });
        const res = createMockRes();
        await reverseLocationHandler(req, res);
        expect(rateLimiter).toHaveBeenCalledWith('reverse_location_attempt:5.6.7.8', 10, 60);
    });
});
