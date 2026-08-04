import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';

vi.mock('../lib/recaptcha.js', () => ({
    recaptchaMiddleware: (req, res, next) => next(),
}));

vi.mock('../lib/rateLimiter.js', () => ({
    rateLimiter: vi.fn().mockResolvedValue({ allowed: true, ttl: 0 }),
}));

vi.mock('../lib/functions.js', () => ({
    checkToken: vi.fn(),
    setCorsHeaders: vi.fn(),
    getClientIp: vi.fn((req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress),
}));

vi.mock('../lib/prisma.js', () => ({
    prisma: {
        City: {
            findMany: vi.fn(),
            deleteMany: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

const { checkToken } = await import('../lib/functions.js');
const { prisma } = await import('../lib/prisma.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const citiesHandler = (await import('./cities.js')).default;

const fakeUser = { id: 1 };

const validCity = { name: 'Athens', country: 'GR', latitude: 37.98, longitude: 23.72 };

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    checkToken.mockResolvedValue(fakeUser);
    prisma.City.deleteMany.mockResolvedValue({});
    prisma.City.upsert.mockResolvedValue({});
});

describe('cities handler', () => {
    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await citiesHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects unsupported methods with 405', async () => {
        const req = createMockReq({ method: 'DELETE' });
        const res = createMockRes();
        await citiesHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('returns 401 when checkToken throws', async () => {
        checkToken.mockRejectedValue(new Error('Invalid or expired token.'));
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await citiesHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    describe('GET', () => {
        it('returns the saved city list on success', async () => {
            prisma.City.findMany.mockResolvedValue([validCity]);
            const req = createMockReq({ method: 'GET' });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ list: [validCity] })
            );
        });

        it('returns 500 when the database throws', async () => {
            prisma.City.findMany.mockRejectedValue(new Error('DB is down'));
            const req = createMockReq({ method: 'GET' });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('rejects when rate limited with 429', async () => {
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 20 });
            const req = createMockReq({ method: 'GET' });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });
    });

    describe('POST', () => {
        it('rejects when rate limited with 429', async () => {
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 45 });
            const req = createMockReq({ method: 'POST', body: { list: [validCity] } });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('rejects a non-array body with 400', async () => {
            const req = createMockReq({ method: 'POST', body: { list: 'not-an-array' } });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects a city missing a name with 400', async () => {
            const req = createMockReq({ method: 'POST', body: { list: [{ ...validCity, name: '' }] } });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects an out-of-range latitude with 400', async () => {
            const req = createMockReq({ method: 'POST', body: { list: [{ ...validCity, latitude: 999 }] } });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects an out-of-range longitude with 400', async () => {
            const req = createMockReq({ method: 'POST', body: { list: [{ ...validCity, longitude: -999 }] } });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('upserts each city and does not touch the database when nothing was removed', async () => {
            const req = createMockReq({ method: 'POST', body: { list: [validCity] } });
            const res = createMockRes();
            await citiesHandler(req, res);

            expect(prisma.City.deleteMany).not.toHaveBeenCalled();
            expect(prisma.City.upsert).toHaveBeenCalledTimes(1);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('only deletes cities explicitly listed in "removed"', async () => {
            const removedCity = { name: 'Paris', country: 'FR' };
            const req = createMockReq({ method: 'POST', body: { list: [validCity], removed: [removedCity] } });
            const res = createMockRes();
            await citiesHandler(req, res);

            expect(prisma.City.deleteMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        OR: [{ name: removedCity.name, country: removedCity.country }]
                    })
                })
            );
            expect(prisma.City.upsert).toHaveBeenCalledTimes(1);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('returns 500 when the delete step fails', async () => {
            prisma.City.deleteMany.mockRejectedValue(new Error('DB is down'));
            const req = createMockReq({ method: 'POST', body: { list: [validCity], removed: [{ name: 'Paris', country: 'FR' }] } });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('returns 500 when the upsert step fails', async () => {
            prisma.City.upsert.mockRejectedValue(new Error('DB is down'));
            const req = createMockReq({ method: 'POST', body: { list: [validCity] } });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
