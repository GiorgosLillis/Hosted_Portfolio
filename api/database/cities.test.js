import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';

vi.mock('../lib/recaptcha.js', () => ({
    recaptchaMiddleware: (req, res, next) => next(),
}));

vi.mock('../lib/rateLimiter.js', () => ({
    rateLimiter: vi.fn().mockResolvedValue({ allowed: true, ttl: 0 }),
}));

vi.mock('../lib/functions.js', () => ({
    sendStatus: (res, status, code, message, extra = {}) => res.status(status).json({ success: status < 400, code, message, ...extra }),
    checkToken: vi.fn(),
    setCorsHeaders: vi.fn(),
    getClientIp: vi.fn((req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress),
}));

vi.mock('../lib/prisma.js', () => ({
    prisma: {
        $executeRaw: vi.fn(),
        city: {
            findMany: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

const { checkToken } = await import('../lib/functions.js');
const { prisma } = await import('../lib/prisma.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const citiesHandler = (await import('./cities.js')).default;

const fakeUser = { id: 1 };

const validCity = { name: 'Athens', country: 'GR', latitude: 37.98, longitude: 23.72 };

// $executeRaw is a tagged template: the values come after the SQL text, in the order they appear in it
function savedColumns() {
    const [, userId, names, countries, regions, latitudes, longitudes] = prisma.$executeRaw.mock.calls[0];
    return { userId, names, countries, regions, latitudes, longitudes };
}

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    checkToken.mockResolvedValue(fakeUser);
    prisma.city.deleteMany.mockResolvedValue({});
    prisma.$executeRaw.mockResolvedValue(1);
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
            prisma.city.findMany.mockResolvedValue([validCity]);
            const req = createMockReq({ method: 'GET' });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ list: [validCity] })
            );
        });

        it('returns 500 when the database throws', async () => {
            prisma.city.findMany.mockRejectedValue(new Error('DB is down'));
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

        it('rejects an out-of-range latitude or longitude with 400', async () => {
            for (const change of [{ latitude: 999 }, { longitude: -999 }]) {
                const res = createMockRes();
                await citiesHandler(createMockReq({ method: 'POST', body: { list: [{ ...validCity, ...change }] } }), res);
                expect(res.status).toHaveBeenCalledWith(400);
            }
        });

        it('rejects coordinates that are missing, empty, not numbers or NaN with 400', async () => {
            for (const bad of [undefined, null, '', '   ', 'abc', NaN, true, {}, '45abc']) {
                for (const field of ['latitude', 'longitude']) {
                    const res = createMockRes();
                    await citiesHandler(createMockReq({ method: 'POST', body: { list: [{ ...validCity, [field]: bad }] } }), res);
                    expect(res.status, `${field}=${String(bad)}`).toHaveBeenCalledWith(400);
                }
            }
            expect(prisma.$executeRaw).not.toHaveBeenCalled();
            expect(prisma.city.deleteMany).not.toHaveBeenCalled();
        });

        it('rejects a name or country over 100 characters with 400', async () => {
            for (const change of [{ name: 'a'.repeat(101) }, { country: 'a'.repeat(101) }]) {
                const res = createMockRes();
                await citiesHandler(createMockReq({ method: 'POST', body: { list: [{ ...validCity, ...change }] } }), res);
                expect(res.status).toHaveBeenCalledWith(400);
            }
            expect(prisma.$executeRaw).not.toHaveBeenCalled();
        });

        it('rejects a region over 100 characters or that is not a string with 400', async () => {
            for (const region of ['a'.repeat(101), 42, ['Attica'], {}]) {
                const res = createMockRes();
                await citiesHandler(createMockReq({ method: 'POST', body: { list: [{ ...validCity, region }] } }), res);
                expect(res.status, JSON.stringify(region)).toHaveBeenCalledWith(400);
            }
            expect(prisma.$executeRaw).not.toHaveBeenCalled();
        });

        it('rejects a list with more than 100 cities with 400', async () => {
            const tooMany = Array.from({ length: 101 }, (_, index) => ({ ...validCity, latitude: index - 50 }));
            const res = createMockRes();
            await citiesHandler(createMockReq({ method: 'POST', body: { list: tooMany } }), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(prisma.$executeRaw).not.toHaveBeenCalled();
        });

        it('rejects the same place twice with 400, since one statement cannot save it twice', async () => {
            const req = createMockReq({ method: 'POST', body: { list: [validCity, { ...validCity, name: 'Athina', latitude: '37.98' }] } });
            const res = createMockRes();
            await citiesHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'city-duplicate' }));
            expect(prisma.$executeRaw).not.toHaveBeenCalled();
        });

        it('saves the whole list in one statement with the parsed coordinates, then deletes every other city of the user', async () => {
            const list = [
                { ...validCity, latitude: '37.98', longitude: '23.72', region: 'Attica' },
                { name: 'Agios Georgios', country: 'GR', latitude: 39.5, longitude: 21.7 },
                { name: 'Agios Georgios', country: 'GR', latitude: 37.1, longitude: 23.1, region: '' },
            ];
            const res = createMockRes();
            await citiesHandler(createMockReq({ method: 'POST', body: { list } }), res);

            expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
            expect(savedColumns()).toEqual({
                userId: fakeUser.id,
                names: ['Athens', 'Agios Georgios', 'Agios Georgios'],
                countries: ['GR', 'GR', 'GR'],
                regions: ['Attica', null, null],
                latitudes: [37.98, 39.5, 37.1],
                longitudes: [23.72, 21.7, 23.1],
            });
            expect(prisma.city.deleteMany).toHaveBeenCalledWith({
                where: {
                    userId: fakeUser.id,
                    NOT: [
                        { latitude: 37.98, longitude: 23.72 },
                        { latitude: 39.5, longitude: 21.7 },
                        { latitude: 37.1, longitude: 23.1 },
                    ],
                },
            });
            // Saving first means a failed delete leaves extra old cities, never missing ones
            expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.city.deleteMany.mock.invocationCallOrder[0]);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('identifies a place by its coordinates and keeps a stored region when the save has none', async () => {
            await citiesHandler(createMockReq({ method: 'POST', body: { list: [validCity] } }), createMockRes());
            const sql = prisma.$executeRaw.mock.calls[0][0].join('?');
            expect(sql).toContain('ON CONFLICT ("userId", "latitude", "longitude")');
            expect(sql).toContain('COALESCE(EXCLUDED."region", "cities"."region")');
        });

        it('treats an empty list as "delete every favorite", without an insert', async () => {
            const res = createMockRes();
            await citiesHandler(createMockReq({ method: 'POST', body: { list: [] } }), res);

            expect(prisma.$executeRaw).not.toHaveBeenCalled();
            expect(prisma.city.deleteMany).toHaveBeenCalledWith({ where: { userId: fakeUser.id, NOT: [] } });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('ignores a "removed" field sent by an older version of the page', async () => {
            const res = createMockRes();
            await citiesHandler(createMockReq({ method: 'POST', body: { list: [validCity], removed: [{ name: 'Paris', country: 'FR' }] } }), res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('returns 500 when the save statement fails, before deleting anything', async () => {
            prisma.$executeRaw.mockRejectedValue(new Error('DB is down'));
            const res = createMockRes();
            await citiesHandler(createMockReq({ method: 'POST', body: { list: [validCity] } }), res);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(prisma.city.deleteMany).not.toHaveBeenCalled();
        });

        it('returns 500 when the delete step fails', async () => {
            prisma.city.deleteMany.mockRejectedValue(new Error('DB is down'));
            const res = createMockRes();
            await citiesHandler(createMockReq({ method: 'POST', body: { list: [validCity] } }), res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
