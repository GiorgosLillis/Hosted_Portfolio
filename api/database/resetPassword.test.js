import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';

vi.mock('../lib/recaptcha.js', () => ({
    recaptchaMiddleware: (req, res, next) => next(),
}));

vi.mock('../lib/rateLimiter.js', () => ({
    rateLimiter: vi.fn().mockResolvedValue({ allowed: true, ttl: 0 }),
}));

vi.mock('../lib/functions.js', () => ({
    setCorsHeaders: vi.fn(),
    isValidEmail: vi.fn(() => true),
    isValidPassword: vi.fn(() => true),
    getClientIp: vi.fn((req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress),
}));

vi.mock('../lib/prisma.js', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@upstash/redis', () => ({
    Redis: {
        fromEnv: vi.fn(() => ({
            get: vi.fn(),
            del: vi.fn(),
        })),
    },
}));

vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({
            sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
        })),
    },
}));

const { prisma } = await import('../lib/prisma.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const { isValidEmail, isValidPassword } = await import('../lib/functions.js');
const { Redis } = await import('@upstash/redis');
const nodemailer = (await import('nodemailer')).default;
const resetPasswordHandler = (await import('./resetPassword.js')).default;

const redis = Redis.fromEnv.mock.results[0].value;
const sendMail = nodemailer.createTransport.mock.results[0].value.sendMail;

const rawToken = 'a'.repeat(64);
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
const fakeUserId = 1;

const validBody = {
    email: 'submitted-in-url@example.com',
    token: rawToken,
    new_password: 'NewStr0ng!Pass',
};

const realAccountEmail = 'real-account-email@example.com';
let oldPasswordHash;
let fakeUser;

beforeEach(async () => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    isValidEmail.mockReturnValue(true);
    isValidPassword.mockReturnValue(true);
    redis.get.mockResolvedValue(fakeUserId);
    redis.del.mockResolvedValue(1);
    oldPasswordHash = await bcrypt.hash('OldStr0ng!Pass', 10);
    fakeUser = { id: fakeUserId, email: realAccountEmail, passwordHash: oldPasswordHash };
    prisma.user.findUnique.mockResolvedValue(fakeUser);
    prisma.user.update.mockResolvedValue({ id: fakeUserId });
    sendMail.mockClear();
    sendMail.mockResolvedValue({ messageId: 'test-id' });
});

describe('resetPassword handler', () => {
    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await resetPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects non-PUT methods with 405', async () => {
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await resetPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('rejects when rate limited with 429', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 60 });
        const req = createMockReq({ method: 'PUT', body: validBody });
        const res = createMockRes();
        await resetPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('rejects a missing token with 400', async () => {
        const req = createMockReq({ method: 'PUT', body: { ...validBody, token: undefined } });
        const res = createMockRes();
        await resetPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(redis.get).not.toHaveBeenCalled();
    });

    it('rejects an invalid new password with 400', async () => {
        isValidPassword.mockReturnValueOnce(false);
        const req = createMockReq({ method: 'PUT', body: { ...validBody, new_password: 'weak' } });
        const res = createMockRes();
        await resetPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(redis.get).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired token with 400', async () => {
        redis.get.mockResolvedValue(null);
        const req = createMockReq({ method: 'PUT', body: validBody });
        const res = createMockRes();
        await resetPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects with 400 when the account behind the token no longer exists', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        const req = createMockReq({ method: 'PUT', body: validBody });
        const res = createMockRes();
        await resetPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when the new password is the same as the current password', async () => {
        const req = createMockReq({ method: 'PUT', body: { ...validBody, new_password: 'OldStr0ng!Pass' } });
        const res = createMockRes();
        await resetPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'New password must be different from your current password.' })
        );
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('looks up the token by its hash, not the raw value', async () => {
        const req = createMockReq({ method: 'PUT', body: validBody });
        const res = createMockRes();
        await resetPasswordHandler(req, res);
        expect(redis.get).toHaveBeenCalledWith(`password_reset:${tokenHash}`);
    });

    it('updates the password and deletes the token on success', async () => {
        const req = createMockReq({ method: 'PUT', body: validBody });
        const res = createMockRes();
        await resetPasswordHandler(req, res);

        expect(prisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: fakeUserId } })
        );
        const updateArgs = prisma.user.update.mock.calls[0][0];
        expect(updateArgs.data.passwordHash).not.toBe(validBody.new_password);
        // A reset must invalidate every other active session, same as a password change via edit
        expect(updateArgs.data.tokenVersion).toEqual({ increment: 1 });

        // Two distinct keys get deleted: the reset token itself, and the cached session
        expect(redis.del).toHaveBeenCalledWith(`password_reset:${tokenHash}`);
        expect(redis.del).toHaveBeenCalledWith(`user_session:${fakeUserId}`);

        // Confirmation goes to the real account email from the DB, not whatever was in the request body
        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ to: realAccountEmail })
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('still returns 200 when the confirmation email fails to send', async () => {
        sendMail.mockRejectedValueOnce(new Error('SMTP is down'));
        const req = createMockReq({ method: 'PUT', body: validBody });
        const res = createMockRes();
        await resetPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 if the database throws unexpectedly', async () => {
        prisma.user.update.mockRejectedValue(new Error('DB is down'));
        const req = createMockReq({ method: 'PUT', body: validBody });
        const res = createMockRes();
        await resetPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
