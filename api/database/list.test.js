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
        userShoppingListItem: {
            findMany: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

const { checkToken } = await import('../lib/functions.js');
const { prisma } = await import('../lib/prisma.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const listHandler = (await import('./list.js')).default;

const fakeUser = { id: 1 };

const validItem = { item: 'Milk', category: 'Dairy', quantity: 2, unit: 'L', check: 'false' };

// $executeRaw is a tagged template: the values come after the SQL text, in the order they appear in it
function savedColumns() {
    const [, userId, categories, names, quantities, units, purchased] = prisma.$executeRaw.mock.calls[0];
    return { userId, categories, names, quantities, units, purchased };
}

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    checkToken.mockResolvedValue(fakeUser);
    prisma.userShoppingListItem.deleteMany.mockResolvedValue({});
    prisma.$executeRaw.mockResolvedValue(1);
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

    describe('POST (saving the list)', () => {
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

        it('rejects items with a wrong type, an empty or too long field, or a bad quantity with 400', async () => {
            const invalidItems = [
                { ...validItem, item: 42 },
                { ...validItem, item: '   ' },
                { ...validItem, item: 'a'.repeat(101) },
                { ...validItem, item: '<script>alert(1)</script>' },
                { ...validItem, item: 'Milk "fresh"' },
                { ...validItem, item: '=HYPERLINK("x")' },
                { ...validItem, item: 'Pizza 🍕' },
                { ...validItem, category: '' },
                { ...validItem, category: 'a'.repeat(51) },
                { ...validItem, unit: '' },
                { ...validItem, unit: 'a'.repeat(31) },
                { ...validItem, quantity: 0 },
                { ...validItem, quantity: -3 },
                { ...validItem, quantity: 'lots' },
                { ...validItem, quantity: '' },
                { ...validItem, quantity: null },
                { ...validItem, quantity: 1001 },
                { ...validItem, quantity: 5_000_000 },
                { ...validItem, check: { yes: true } },
                null,
                'Milk',
            ];

            for (const invalid of invalidItems) {
                const res = createMockRes();
                await listHandler(createMockReq({ method: 'POST', body: { list: [{ ...validItem, item: 'Bread' }, invalid] } }), res);
                expect(res.status, JSON.stringify(invalid)).toHaveBeenCalledWith(400);
            }
            expect(prisma.$executeRaw).not.toHaveBeenCalled();
            expect(prisma.userShoppingListItem.deleteMany).not.toHaveBeenCalled();
        });

        it('rejects the same item twice with 400, since one statement cannot save it twice', async () => {
            const req = createMockReq({ method: 'POST', body: { list: [validItem, { ...validItem, quantity: 3 }] } });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'list-duplicate' }));
            expect(prisma.$executeRaw).not.toHaveBeenCalled();
        });

        it('rejects a list with more than 500 items with 400', async () => {
            const tooMany = Array.from({ length: 501 }, (_, index) => ({ ...validItem, item: `Item ${index}` }));
            const res = createMockRes();
            await listHandler(createMockReq({ method: 'POST', body: { list: tooMany } }), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(prisma.$executeRaw).not.toHaveBeenCalled();
        });

        it('accepts item names with the punctuation real products use, in any language', async () => {
            const list = ["M&M's", 'Coca-Cola', 'Milk 2%', 'Water (1.5L)', 'Φέτα Π.Ο.Π.'].map((item) => ({ ...validItem, item }));
            const res = createMockRes();
            await listHandler(createMockReq({ method: 'POST', body: { list } }), res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('accepts a quantity of exactly 1000', async () => {
            const req = createMockReq({ method: 'POST', body: { list: [{ ...validItem, quantity: 1000 }] } });
            const res = createMockRes();
            await listHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('saves the whole list in one statement, in the order it was sent, then deletes every other item of the user', async () => {
            const list = [validItem, { item: 'Eggs', category: 'Dairy', quantity: '12', unit: 'pcs', check: 'true' }];
            const res = createMockRes();
            await listHandler(createMockReq({ method: 'POST', body: { list } }), res);

            expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
            expect(savedColumns()).toEqual({
                userId: fakeUser.id,
                categories: ['Dairy', 'Dairy'],
                names: ['Milk', 'Eggs'],
                quantities: [2, 12],
                units: ['L', 'pcs'],
                purchased: [false, true],
            });
            expect(prisma.userShoppingListItem.deleteMany).toHaveBeenCalledWith({
                where: { userId: fakeUser.id, name: { notIn: ['Milk', 'Eggs'] } },
            });
            // Saving first means a failed delete leaves extra old items, never missing ones
            expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.userShoppingListItem.deleteMany.mock.invocationCallOrder[0]);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('marks an item as purchased for the string "true" and for a real true', async () => {
            const list = [{ ...validItem, check: true }, { ...validItem, item: 'Eggs', check: 'true' }, { ...validItem, item: 'Tea', check: 'false' }];
            await listHandler(createMockReq({ method: 'POST', body: { list } }), createMockRes());
            expect(savedColumns().purchased).toEqual([true, true, false]);
        });

        it('treats an empty list as "delete everything", without an insert', async () => {
            const res = createMockRes();
            await listHandler(createMockReq({ method: 'POST', body: { list: [] } }), res);

            expect(prisma.$executeRaw).not.toHaveBeenCalled();
            expect(prisma.userShoppingListItem.deleteMany).toHaveBeenCalledWith({ where: { userId: fakeUser.id, name: { notIn: [] } } });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('ignores a "removed" field sent by an older version of the page', async () => {
            const res = createMockRes();
            await listHandler(createMockReq({ method: 'POST', body: { list: [validItem], removed: ['Eggs'] } }), res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('returns 500 when the save statement fails, before deleting anything', async () => {
            prisma.$executeRaw.mockRejectedValue(new Error('DB is down'));
            const res = createMockRes();
            await listHandler(createMockReq({ method: 'POST', body: { list: [validItem] } }), res);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(prisma.userShoppingListItem.deleteMany).not.toHaveBeenCalled();
        });

        it('returns 500 when the delete step fails', async () => {
            prisma.userShoppingListItem.deleteMany.mockRejectedValue(new Error('DB is down'));
            const res = createMockRes();
            await listHandler(createMockReq({ method: 'POST', body: { list: [validItem] } }), res);
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
