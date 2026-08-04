import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';

vi.mock('../lib/recaptcha.js', () => ({
    recaptchaMiddleware: (req, res, next) => next(),
}));

vi.mock('../lib/rateLimiter.js', () => ({
    rateLimiter: vi.fn().mockResolvedValue({ allowed: true, ttl: 0 }),
}));

vi.mock('../lib/functions.js', () => ({
    checkToken: vi.fn(),
    clearAuthCookies: vi.fn(),
    isValidPassword: vi.fn(() => true),
    setCorsHeaders: vi.fn(),
    getClientIp: vi.fn((req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress),
}));

vi.mock('../lib/prisma.js', () => ({
    prisma: {
        user: {
            delete: vi.fn(),
        },
    },
}));

const { checkToken, isValidPassword } = await import('../lib/functions.js');
const { prisma } = await import('../lib/prisma.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const deleteUserHandler = (await import('./deleteUser.js')).default;

const credentials = { password: 'Str0ng!Pass' };

let storedHash;

beforeEach(async () => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    storedHash = await bcrypt.hash(credentials.password, 10);
});

describe("delete user handler", () => {
    it('rejects non-DELETE methods with 405', async () => {
        const req = createMockReq({ method: 'POST' });
        const res = createMockRes();
        await deleteUserHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await deleteUserHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects when rate limited by IP or email with 429', async () => {
        checkToken.mockResolvedValue({ id: 1, passwordHash: storedHash });
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 60 });
        const req = createMockReq({ method: 'DELETE', body: credentials });
        const res = createMockRes();
        await deleteUserHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('rejects when checkToken throws (no/invalid token) with 401', async () => {
        checkToken.mockRejectedValue(new Error('Invalid or expired token.'));
        const req = createMockReq({ method: 'DELETE' });
        const res = createMockRes();
        await deleteUserHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects when password is missing with 400', async () => {
        checkToken.mockResolvedValue({ id: 1, passwordHash: storedHash });
        const req = createMockReq({ method: 'DELETE' });
        const res = createMockRes();
        await deleteUserHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects when invalid password format with 400', async () => {
        checkToken.mockResolvedValue({ id: 1, passwordHash: storedHash });
        isValidPassword.mockReturnValueOnce(false);
        const req = createMockReq({ method: 'DELETE', body: { password: 'aaaa' } });
        const res = createMockRes();
        await deleteUserHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects when password does not match with 401', async () => {
        checkToken.mockResolvedValue({ id: 1, passwordHash: storedHash });
        const req = createMockReq({ method: 'DELETE', body: { password: 'WrongPass1!' } });
        const res = createMockRes();
        await deleteUserHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    })
})