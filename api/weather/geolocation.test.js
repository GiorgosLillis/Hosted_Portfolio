import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';

vi.mock('../lib/functions.js', () => ({
    setCorsHeaders: vi.fn(),
    getClientIp: vi.fn((req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress),
    enforceRateLimit: vi.fn(async (res, key, limit, windowSeconds) => {
        const { rateLimiter } = await import('../lib/rateLimiter.js');
        const { allowed, ttl } = await rateLimiter(key, limit, windowSeconds);
        if (!allowed) {
            res.setHeader('Retry-After', ttl);
            res.status(429).json({ success: false, message: `Too many requests. Please try again in ${ttl} seconds.` });
        }
        return allowed;
    }),
}));

vi.mock('../lib/rateLimiter.js', () => ({
    rateLimiter: vi.fn().mockResolvedValue({ allowed: true, ttl: 0 }),
}));

const { rateLimiter } = await import('../lib/rateLimiter.js');
const geolocationHandler = (await import('./geolocation.js')).default;

function stubFetchSuccess(data) {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
}

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
});

describe('geolocation handler', () => {
    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await geolocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects an unknown or missing action with 400', async () => {
        const req = createMockReq({ body: {}, query: {} });
        const res = createMockRes();
        await geolocationHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    describe('reverse action', () => {
        const mockOsmResult = {
            address: {
                country: 'Greece',
                country_code: 'gr',
                city: 'Athens',
            },
        };

        beforeEach(() => {
            stubFetchSuccess(mockOsmResult);
        });

        it('rejects when rate limited with 429', async () => {
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 30 });
            const req = createMockReq({ body: { lat: 37.9, lon: 23.7 }, query: { action: 'reverse' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('rejects an invalid latitude with 400', async () => {
            const req = createMockReq({ body: { lat: 999, lon: 23.7 }, query: { action: 'reverse' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects an invalid longitude with 400', async () => {
            const req = createMockReq({ body: { lat: 37.9, lon: -999 }, query: { action: 'reverse' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('returns formatted location data on a successful lookup', async () => {
            const req = createMockReq({ body: { lat: 11.1, lon: 21.1 }, query: { action: 'reverse' } });
            const res = createMockRes();
            await geolocationHandler(req, res);

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
            const req = createMockReq({ body: { lat: 11.2, lon: 21.2 }, query: { action: 'reverse' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(503);
        });

        it('returns 500 when the upstream call throws', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
            const req = createMockReq({ body: { lat: 11.3, lon: 21.3 }, query: { action: 'reverse' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('uses the x-forwarded-for header for the rate-limit key, not req.ip', async () => {
            const req = createMockReq({ body: { lat: 11.4, lon: 21.4 }, query: { action: 'reverse' }, headers: { 'x-forwarded-for': '5.6.7.8' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(rateLimiter).toHaveBeenCalledWith('reverse_location_attempt:5.6.7.8', 10, 60);
        });
    });

    describe('forward action', () => {
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

        beforeEach(() => {
            stubFetchSuccess(mockOsmResult);
        });

        it('rejects when rate limited with 429', async () => {
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 30 });
            const req = createMockReq({ body: { city: 'Athens' }, query: { action: 'forward' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('rejects a missing city with 400', async () => {
            const req = createMockReq({ body: {}, query: { action: 'forward' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects a city name over 100 characters with 400', async () => {
            const req = createMockReq({ body: { city: 'a'.repeat(101) }, query: { action: 'forward' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects an overly long country with 400', async () => {
            const req = createMockReq({ body: { city: 'Athens', country: 'a'.repeat(101) }, query: { action: 'forward' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('returns formatted location data on a successful lookup', async () => {
            const req = createMockReq({ body: { city: 'ForwardCity1', country: 'GR' }, query: { action: 'forward' } });
            const res = createMockRes();
            await geolocationHandler(req, res);

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
            const req = createMockReq({ body: { city: 'ForwardCity2', country: 'XX' }, query: { action: 'forward' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('propagates an upstream error status', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                json: async () => ({ error: 'Service unavailable' }),
            });
            const req = createMockReq({ body: { city: 'ForwardCity3', country: 'GR' }, query: { action: 'forward' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(503);
        });

        it('returns 500 when the upstream call throws', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
            const req = createMockReq({ body: { city: 'ForwardCity4', country: 'GR' }, query: { action: 'forward' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('uses the x-forwarded-for header for the rate-limit key, not req.ip', async () => {
            const req = createMockReq({ body: { city: 'ForwardCity5', country: 'GR' }, query: { action: 'forward' }, headers: { 'x-forwarded-for': '1.2.3.4' } });
            const res = createMockRes();
            await geolocationHandler(req, res);
            expect(rateLimiter).toHaveBeenCalledWith('forward_location_attempt:1.2.3.4', 10, 60);
        });
    });
});
