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
    getClientIp: vi.fn((req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress),
    isValidEmail: vi.fn(() => true),
    isValidPassword: vi.fn(() => true),
    handleApiError: vi.fn((res, error) => {
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
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@upstash/redis', () => ({
    Redis: {
        fromEnv: vi.fn(() => ({
            get: vi.fn(),
            set: vi.fn(),
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
const passwordRecoveryHandler = (await import('./passwordRecovery.js')).default;

const redis = Redis.fromEnv.mock.results[0].value;
const sendMail = nodemailer.createTransport.mock.results[0].value.sendMail;

const fakeUser = { id: 1, email: 'user@example.com' };

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    isValidEmail.mockReturnValue(true);
    isValidPassword.mockReturnValue(true);
    redis.set.mockResolvedValue('OK');
    redis.get.mockResolvedValue(null);
    redis.del.mockResolvedValue(1);
    sendMail.mockResolvedValue({ messageId: 'test-id' });
});

describe('passwordRecovery handler', () => {
    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await passwordRecoveryHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects methods other than POST/PUT with 405', async () => {
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await passwordRecoveryHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    describe('POST (request a reset link)', () => {
        it('rejects when rate limited with 429', async () => {
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 300 });
            const req = createMockReq({ method: 'POST', body: { email: fakeUser.email } });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('rejects an invalid email format with 400', async () => {
            const req = createMockReq({ method: 'POST', body: { email: 'not-an-email' } });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(prisma.user.findUnique).not.toHaveBeenCalled();
        });

        it('returns the generic success message and sends nothing for an unknown email', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            const req = createMockReq({ method: 'POST', body: { email: 'nobody@example.com' } });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);

            expect(sendMail).not.toHaveBeenCalled();
            expect(redis.set).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'If an account with that email exists, a reset link has been sent.',
                })
            );
        });

        it('generates a token, stores its hash in Redis, and emails a link for a known email', async () => {
            prisma.user.findUnique.mockResolvedValue(fakeUser);
            const req = createMockReq({ method: 'POST', body: { email: fakeUser.email } });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);

            expect(redis.set).toHaveBeenCalledWith(
                expect.stringMatching(/^password_reset:[a-f0-9]{64}$/),
                fakeUser.id,
                { ex: 1800 }
            );

            expect(sendMail).toHaveBeenCalledTimes(1);
            const mailArgs = sendMail.mock.calls[0][0];
            expect(mailArgs.to).toBe(fakeUser.email);
            expect(mailArgs.html).toContain('token=');

            // The raw token in the email must not be the same string as the hash stored in Redis
            const storedKey = redis.set.mock.calls[0][0];
            const storedHash = storedKey.replace('password_reset:', '');
            const linkMatch = mailArgs.html.match(/token=([a-f0-9]+)/);
            const rawTokenFromLink = linkMatch[1];
            expect(rawTokenFromLink).not.toBe(storedHash);
            expect(crypto.createHash('sha256').update(rawTokenFromLink).digest('hex')).toBe(storedHash);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'If an account with that email exists, a reset link has been sent.',
                })
            );
        });

        it('returns 500 if the database throws unexpectedly', async () => {
            prisma.user.findUnique.mockRejectedValue(new Error('DB is down'));
            const req = createMockReq({ method: 'POST', body: { email: fakeUser.email } });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('PUT (redeem a reset link)', () => {
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
        let fakeResetUser;

        beforeEach(async () => {
            redis.get.mockResolvedValue(fakeUserId);
            oldPasswordHash = await bcrypt.hash('OldStr0ng!Pass', 10);
            fakeResetUser = { id: fakeUserId, email: realAccountEmail, passwordHash: oldPasswordHash };
            prisma.user.findUnique.mockResolvedValue(fakeResetUser);
            prisma.user.update.mockResolvedValue({ id: fakeUserId });
        });

        it('rejects when rate limited with 429', async () => {
            rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 60 });
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('rejects a missing token with 400', async () => {
            const req = createMockReq({ method: 'PUT', body: { ...validBody, token: undefined } });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(redis.get).not.toHaveBeenCalled();
        });

        it('rejects an invalid new password with 400', async () => {
            isValidPassword.mockReturnValueOnce(false);
            const req = createMockReq({ method: 'PUT', body: { ...validBody, new_password: 'weak' } });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(redis.get).not.toHaveBeenCalled();
        });

        it('rejects an invalid or expired token with 400', async () => {
            redis.get.mockResolvedValue(null);
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it('rejects with 400 when the account behind the token no longer exists', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it('rejects when the new password is the same as the current password', async () => {
            const req = createMockReq({ method: 'PUT', body: { ...validBody, new_password: 'OldStr0ng!Pass' } });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'New password must be different from your current password.' })
            );
            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it('looks up the token by its hash, not the raw value', async () => {
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);
            expect(redis.get).toHaveBeenCalledWith(`password_reset:${tokenHash}`);
        });

        it('updates the password and deletes the token on success', async () => {
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);

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
            await passwordRecoveryHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('returns 500 if the database throws unexpectedly', async () => {
            prisma.user.update.mockRejectedValue(new Error('DB is down'));
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await passwordRecoveryHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
