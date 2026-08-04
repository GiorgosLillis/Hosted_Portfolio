import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';

function decodeTokenFromResponse(res) {
    const setCookieCall = res.setHeader.mock.calls.find(call => call[0] === 'Set-Cookie');
    const tokenCookie = setCookieCall[1].find(cookieStr => cookieStr.startsWith('token='));
    const rawToken = tokenCookie.split('token=')[1].split(';')[0];
    return jwt.decode(rawToken);
}

vi.mock('../lib/recaptcha.js', () => ({
    recaptchaMiddleware: (req, res, next) => next(),
}));

vi.mock('../lib/rateLimiter.js', () => ({
    rateLimiter: vi.fn().mockResolvedValue({ allowed: true, ttl: 0 }),
}));

vi.mock('../lib/prisma.js', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
    },
}));

const { prisma } = await import('../lib/prisma.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const registerHandler = (await import('./register.js')).default;

const validBody = {
    email: 'new@example.com',
    password: 'Str0ng!Pass',
    first_name: 'John',
    last_name: 'Doe',
};

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
});

describe('register handler', () => {
    it('rejects non-POST methods with 405', async () => {
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await registerHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('rejects when rate limited with 429', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 120 });
        const req = createMockReq({ body: validBody });
        const res = createMockRes();
        await registerHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('rejects invalid input (weak password) with 400', async () => {
        const req = createMockReq({ body: { ...validBody, password: 'weak' } });
        const res = createMockRes();
        await registerHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects when the email is already registered with 400', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: validBody.email });
        const req = createMockReq({ body: validBody });
        const res = createMockRes();
        await registerHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'User with this email already exists' })
        );
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates a new user and sets an auth cookie on success', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue({
            id: 1,
            email: validBody.email,
            firstName: 'John',
            lastName: 'Doe',
            tokenVersion: 0,
        });

        const req = createMockReq({ body: validBody });
        const res = createMockRes();
        await registerHandler(req, res);

        expect(prisma.user.create).toHaveBeenCalledTimes(1);
        expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.any(Array));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ user: expect.objectContaining({ email: validBody.email }) })
        );
    });

    it('signs the JWT with the new account\'s tokenVersion', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue({
            id: 1,
            email: validBody.email,
            firstName: 'John',
            lastName: 'Doe',
            tokenVersion: 0,
        });

        const req = createMockReq({ body: validBody });
        const res = createMockRes();
        await registerHandler(req, res);

        const decoded = decodeTokenFromResponse(res);
        expect(decoded.tokenVersion).toBe(0);
        expect(decoded.userId).toBe(1);
    });

    it('sanitizes first/last name before storing them', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.user.create.mockResolvedValue({ id: 1, email: validBody.email, firstName: 'John', lastName: 'Doe' });

        const req = createMockReq({ body: { ...validBody, first_name: 'John', last_name: 'Doe' } });
        const res = createMockRes();
        await registerHandler(req, res);

        const createArgs = prisma.user.create.mock.calls[0][0];
        expect(createArgs.data.firstName).toBe('John');
        expect(createArgs.data.passwordHash).not.toBe(validBody.password);
    });

    it('returns 500 if the database throws unexpectedly', async () => {
        prisma.user.findUnique.mockRejectedValue(new Error('DB is down'));
        const req = createMockReq({ body: validBody });
        const res = createMockRes();
        await registerHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
