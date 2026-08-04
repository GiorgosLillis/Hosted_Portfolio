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
        userShoppingListItem: {
            findMany: vi.fn(),
            deleteMany: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

const { checkToken } = await import('../lib/functions.js');
const { prisma } = await import('../lib/prisma.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const listHandler = (await import('./list.js')).default;

const fakeUser = { id: 1 };

const validItem = { item: 'Milk', category: 'Dairy', quantity: 2, unit: 'L', check: 'false' };

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    checkToken.mockResolvedValue(fakeUser);
    prisma.userShoppingListItem.deleteMany.mockResolvedValue({});
    prisma.userShoppingListItem.upsert.mockResolvedValue({});
});

describe('list handler', () => {
    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await listHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects unsupported methods with 405', async () => {
        const req = createMockReq({ method: 'PUT' });
        const res = createMockRes();
        await listHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('returns 401 when checkToken throws', async () => {
        checkToken.mockRejectedValue(new Error('Invalid or expired token.'));
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await listHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    describe('GET', () => {
        it('returns the shopping list on success', async () => {
            prisma.userShoppingListItem.findMany.mockResolvedValue([validItem]);
            const req = createMockReq({ method: 'GET' });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ list: [validItem] })
            );
        });

        it('returns 500 when the database throws', async () => {
            prisma.userShoppingListItem.findMany.mockRejectedValue(new Error('DB is down'));
            const req = createMockReq({ method: 'GET' });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('rejects when rate limited with 429', async () => {
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 20 });
            const req = createMockReq({ method: 'GET' });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });
    });

    describe('POST (writing items)', () => {
        it('rejects when rate limited with 429', async () => {
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 20 });
            const req = createMockReq({ method: 'POST', body: { list: [validItem] } });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('rejects a non-array body with 400', async () => {
            const req = createMockReq({ method: 'POST', body: { list: 'not-an-array' } });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects a non-array "removed" field with 400', async () => {
            const req = createMockReq({ method: 'POST', body: { list: [validItem], removed: 'not-an-array' } });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('upserts each item and does not touch the database when nothing was removed', async () => {
            const req = createMockReq({ method: 'POST', body: { list: [validItem] } });
            const res = createMockRes();
            await listHandler(req, res);

            expect(prisma.userShoppingListItem.deleteMany).not.toHaveBeenCalled();
            expect(prisma.userShoppingListItem.upsert).toHaveBeenCalledTimes(1);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('only deletes items explicitly listed in "removed"', async () => {
            const req = createMockReq({ method: 'POST', body: { list: [validItem], removed: ['Eggs'] } });
            const res = createMockRes();
            await listHandler(req, res);

            expect(prisma.userShoppingListItem.deleteMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        userId: fakeUser.id,
                        name: { in: ['Eggs'] },
                    }),
                })
            );
            expect(prisma.userShoppingListItem.upsert).toHaveBeenCalledTimes(1);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('maps the "check" string field to a boolean isPurchased', async () => {
            const req = createMockReq({ method: 'POST', body: { list: [{ ...validItem, check: 'true' }] } });
            const res = createMockRes();
            await listHandler(req, res);

            const upsertArgs = prisma.userShoppingListItem.upsert.mock.calls[0][0];
            expect(upsertArgs.update.isPurchased).toBe(true);
            expect(upsertArgs.create.isPurchased).toBe(true);
        });

        it('returns 500 when the delete step fails', async () => {
            prisma.userShoppingListItem.deleteMany.mockRejectedValue(new Error('DB is down'));
            const req = createMockReq({ method: 'POST', body: { list: [validItem], removed: ['Eggs'] } });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('returns 500 when the upsert step fails', async () => {
            prisma.userShoppingListItem.upsert.mockRejectedValue(new Error('DB is down'));
            const req = createMockReq({ method: 'POST', body: { list: [validItem] } });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('DELETE', () => {
        it('clears the shopping list on success', async () => {
            const req = createMockReq({ method: 'DELETE' });
            const res = createMockRes();
            await listHandler(req, res);
            expect(prisma.userShoppingListItem.deleteMany).toHaveBeenCalledWith({
                where: { userId: fakeUser.id },
            });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('returns 500 when the delete fails', async () => {
            prisma.userShoppingListItem.deleteMany.mockRejectedValue(new Error('DB is down'));
            const req = createMockReq({ method: 'DELETE' });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('rejects when rate limited with 429', async () => {
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 20 });
            const req = createMockReq({ method: 'DELETE' });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });
    });
});
