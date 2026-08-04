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
    isValidEmail: vi.fn(() => true),
    isValidPassword: vi.fn(() => true),
    isValidName: vi.fn(() => true),
    setAuthCookies: vi.fn(),
    clearAuthCookies: vi.fn(),
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
    handleApiError: vi.fn((res, error) => {
        if (error.message === 'Invalid or expired token.' || error.message === 'Not authenticated') {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred',
            error: undefined
        });
    }),
}));

vi.mock('../lib/prisma.js', () => ({
    prisma: {
        user: {
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({
            sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
        })),
    },
}));

vi.mock('@upstash/redis', () => ({
    Redis: {
        fromEnv: vi.fn(() => ({
            del: vi.fn(),
        })),
    },
}));

const { checkToken, isValidEmail, isValidPassword, isValidName } = await import('../lib/functions.js');
const { prisma } = await import('../lib/prisma.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const nodemailer = (await import('nodemailer')).default;
const { Redis } = await import('@upstash/redis');
const accountHandler = (await import('./account.js')).default;

const sendMail = nodemailer.createTransport.mock.results[0].value.sendMail;
const redis = Redis.fromEnv.mock.results[0].value;

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    isValidEmail.mockReturnValue(true);
    isValidPassword.mockReturnValue(true);
    isValidName.mockReturnValue(true);
    sendMail.mockResolvedValue({ messageId: 'test-id' });
    redis.del.mockResolvedValue(1);
});

describe('account handler', () => {
    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await accountHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects unhandled methods with 405', async () => {
        const req = createMockReq({ method: 'PATCH' });
        const res = createMockRes();
        await accountHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    describe('GET (account details)', () => {
        const fakeUser = {
            id: 1,
            email: 'user@example.com',
            firstName: 'John',
            lastName: 'Doe',
            createdAt: new Date('2024-01-01'),
        };

        it('rejects when rate limited with 429', async () => {
            checkToken.mockResolvedValue(fakeUser);
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 120 });
            const req = createMockReq({ method: 'GET' });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('returns 401 when checkToken throws (no/invalid token)', async () => {
            checkToken.mockRejectedValue(new Error('Invalid or expired token.'));
            const req = createMockReq({ method: 'GET' });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('returns its mapped user and their data on success', async () => {
            checkToken.mockResolvedValue(fakeUser);
            const req = createMockReq({ method: 'GET' });
            const res = createMockRes();
            await accountHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                user: {
                    id: fakeUser.id,
                    email: fakeUser.email,
                    firstName: fakeUser.firstName,
                    lastName: fakeUser.lastName,
                    createdAt: fakeUser.createdAt
                }
            });
        });
    });

    describe('PUT (edit account)', () => {
        const validBody = {
            email: 'user@example.com',
            current_password: 'Curr3nt!Pass',
            password: '',
            first_name: 'John',
            last_name: 'Doe',
        };

        let storedHash;
        let fakeUser;

        beforeEach(async () => {
            storedHash = await bcrypt.hash(validBody.current_password, 10);
            fakeUser = { id: 1, email: validBody.email, passwordHash: storedHash, tokenVersion: 0 };
            prisma.user.update.mockResolvedValue({
                id: 1,
                email: validBody.email,
                firstName: 'John',
                lastName: 'Doe',
                tokenVersion: 0,
            });
        });

        it('returns 401 when checkToken throws', async () => {
            checkToken.mockRejectedValue(new Error('Invalid or expired token.'));
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('rejects when rate limited with 429', async () => {
            checkToken.mockResolvedValue(fakeUser);
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 30 });
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('rejects invalid input (e.g. missing required field) with 400', async () => {
            checkToken.mockResolvedValue(fakeUser);
            isValidName.mockReturnValueOnce(false);
            const req = createMockReq({ method: 'PUT', body: { ...validBody, first_name: '' } });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it('rejects when current_password does not match with 400', async () => {
            checkToken.mockResolvedValue(fakeUser);
            const req = createMockReq({ method: 'PUT', body: { ...validBody, current_password: 'WrongPass1!' } });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it('updates the user and sets a new auth cookie on success', async () => {
            checkToken.mockResolvedValue(fakeUser);
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await accountHandler(req, res);

            expect(prisma.user.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: fakeUser.id } })
            );
            expect(sendMail).toHaveBeenCalledWith(
                expect.objectContaining({ to: fakeUser.email })
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('still returns 200 when the confirmation email fails to send', async () => {
            checkToken.mockResolvedValue(fakeUser);
            sendMail.mockRejectedValueOnce(new Error('SMTP is down'));
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('does not include passwordHash in the update when the new password is blank', async () => {
            checkToken.mockResolvedValue(fakeUser);
            const req = createMockReq({ method: 'PUT', body: { ...validBody, password: '' } });
            const res = createMockRes();
            await accountHandler(req, res);

            const updateArgs = prisma.user.update.mock.calls[0][0];
            expect(updateArgs.data.passwordHash).toBeUndefined();
        });

        it('includes a hashed passwordHash when a new password is provided', async () => {
            checkToken.mockResolvedValue(fakeUser);
            const req = createMockReq({ method: 'PUT', body: { ...validBody, password: 'NewStr0ng!Pass' } });
            const res = createMockRes();
            await accountHandler(req, res);

            const updateArgs = prisma.user.update.mock.calls[0][0];
            expect(updateArgs.data.passwordHash).toBeDefined();
            expect(updateArgs.data.passwordHash).not.toBe('NewStr0ng!Pass');
        });

        it('bumps tokenVersion and clears the cached session when the password changes', async () => {
            checkToken.mockResolvedValue(fakeUser);
            const req = createMockReq({ method: 'PUT', body: { ...validBody, password: 'NewStr0ng!Pass' } });
            const res = createMockRes();
            await accountHandler(req, res);

            const updateArgs = prisma.user.update.mock.calls[0][0];
            expect(updateArgs.data.tokenVersion).toEqual({ increment: 1 });
            expect(redis.del).toHaveBeenCalledWith(`user_session:${fakeUser.id}`);
        });

        it('does not bump tokenVersion or touch the cache when the password is unchanged', async () => {
            checkToken.mockResolvedValue(fakeUser);
            const req = createMockReq({ method: 'PUT', body: { ...validBody, password: '' } });
            const res = createMockRes();
            await accountHandler(req, res);

            const updateArgs = prisma.user.update.mock.calls[0][0];
            expect(updateArgs.data.tokenVersion).toBeUndefined();
            expect(redis.del).not.toHaveBeenCalled();
        });

        it('returns 500 if the database throws unexpectedly', async () => {
            checkToken.mockResolvedValue(fakeUser);
            prisma.user.update.mockRejectedValue(new Error('DB is down'));
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('DELETE (delete account)', () => {
        const credentials = { password: 'Str0ng!Pass' };
        let storedHash;

        beforeEach(async () => {
            storedHash = await bcrypt.hash(credentials.password, 10);
        });

        it('rejects when rate limited by IP or user with 429', async () => {
            checkToken.mockResolvedValue({ id: 1, passwordHash: storedHash });
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 60 });
            const req = createMockReq({ method: 'DELETE', body: credentials });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('rejects when checkToken throws (no/invalid token) with 401', async () => {
            checkToken.mockRejectedValue(new Error('Invalid or expired token.'));
            const req = createMockReq({ method: 'DELETE' });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('rejects when password is missing with 400', async () => {
            checkToken.mockResolvedValue({ id: 1, passwordHash: storedHash });
            const req = createMockReq({ method: 'DELETE' });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects when invalid password format with 400', async () => {
            checkToken.mockResolvedValue({ id: 1, passwordHash: storedHash });
            isValidPassword.mockReturnValueOnce(false);
            const req = createMockReq({ method: 'DELETE', body: { password: 'aaaa' } });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects when password does not match with 401', async () => {
            checkToken.mockResolvedValue({ id: 1, passwordHash: storedHash });
            const req = createMockReq({ method: 'DELETE', body: { password: 'WrongPass1!' } });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });
});
