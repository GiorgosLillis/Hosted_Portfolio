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
const forwardLocationHandler = (await import('./Forward_Location.js')).default;

const mockOsmResult = [{
    lat: '37.98',
    lon: '23.72',
    name: 'Athens',
    address: {
        country: 'Greece',
        country_code: 'gr',
        city: 'Athens',
    },
}];

function stubFetchSuccess(data = mockOsmResult) {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
}

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    stubFetchSuccess();
});

describe('Forward_Location handler', () => {
    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await forwardLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects when rate limited with 429', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 30 });
        const req = createMockReq({ body: { city: 'Athens' } });
        const res = createMockRes();
        await forwardLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('rejects a missing city with 400', async () => {
        const req = createMockReq({ body: {} });
        const res = createMockRes();
        await forwardLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects a city name over 100 characters with 400', async () => {
        const req = createMockReq({ body: { city: 'a'.repeat(101) } });
        const res = createMockRes();
        await forwardLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects an overly long country with 400', async () => {
        const req = createMockReq({ body: { city: 'Athens', country: 'a'.repeat(101) } });
        const res = createMockRes();
        await forwardLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns formatted location data on a successful lookup', async () => {
        const req = createMockReq({ body: { city: 'ForwardCity1', country: 'GR' } });
        const res = createMockRes();
        await forwardLocationHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            latitude: '37.98',
            longitude: '23.72',
            country_name: 'Greece',
            country: 'GR',
            city: 'Athens',
        });
    });

    it('returns 404 when no results are found', async () => {
        stubFetchSuccess([]);
        const req = createMockReq({ body: { city: 'ForwardCity2', country: 'XX' } });
        const res = createMockRes();
        await forwardLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('propagates an upstream error status', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({ error: 'Service unavailable' }),
        });
        const req = createMockReq({ body: { city: 'ForwardCity3', country: 'GR' } });
        const res = createMockRes();
        await forwardLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(503);
    });

    it('returns 500 when the upstream call throws', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
        const req = createMockReq({ body: { city: 'ForwardCity4', country: 'GR' } });
        const res = createMockRes();
        await forwardLocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('uses the x-forwarded-for header for the rate-limit key, not req.ip', async () => {
        const req = createMockReq({ body: { city: 'ForwardCity5', country: 'GR' }, headers: { 'x-forwarded-for': '1.2.3.4' } });
        const res = createMockRes();
        await forwardLocationHandler(req, res);
        expect(rateLimiter).toHaveBeenCalledWith('forward_location_attempt:1.2.3.4', 10, 60);
    });
});
