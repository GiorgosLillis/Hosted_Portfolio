import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';


vi.mock('../lib/rateLimiter.js', () => ({
    rateLimiter: vi.fn().mockResolvedValue({ allowed: true, ttl: 0 }),
}));

vi.mock('../lib/functions.js', () => ({
    checkToken: vi.fn(),
    setCorsHeaders: vi.fn(),
}));

const { checkToken } = await import('../lib/functions.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const userHandler = (await import('./user.js')).default;

const fakeUser = {
    id: 1,
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe',
    createdAt: new Date('2024-01-01'),
};

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
});

describe('user handler', () => {
    it('rejects non-GET methods with 405', async () => {
        const req = createMockReq({ method: 'POST' });
        const res = createMockRes();
        await userHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await userHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects when rate limited with 429', async () => {
        checkToken.mockResolvedValue(fakeUser);
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 120 });
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await userHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('returns 401 when checkToken throws (no/invalid token)', async () => {
        checkToken.mockRejectedValue(new Error('Invalid or expired token.'));
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await userHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns its mapped user and their data on success', async () => {
        checkToken.mockResolvedValue(fakeUser);
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await userHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            user: {
                id: fakeUser.id,
                email: fakeUser.email,
                firstName: fakeUser.firstName,
                lastName: fakeUser.lastName,
                createdAt: fakeUser.createdAt
            }
        })
    })
}) 