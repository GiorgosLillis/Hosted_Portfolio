import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
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
}));

vi.mock('../lib/prisma.js', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('@upstash/redis', () => ({
    Redis: {
        fromEnv: vi.fn(() => ({
            set: vi.fn(),
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
const { Redis } = await import('@upstash/redis');
const nodemailer = (await import('nodemailer')).default;
const forgotPasswordHandler = (await import('./forgotPassword.js')).default;

const redis = Redis.fromEnv.mock.results[0].value;
const sendMail = nodemailer.createTransport.mock.results[0].value.sendMail;

const fakeUser = { id: 1, email: 'user@example.com' };

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    redis.set.mockResolvedValue('OK');
    sendMail.mockResolvedValue({ messageId: 'test-id' });
});

describe('forgotPassword handler', () => {
    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await forgotPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects non-POST methods with 405', async () => {
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await forgotPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('rejects when rate limited with 429', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 300 });
        const req = createMockReq({ body: { email: fakeUser.email } });
        const res = createMockRes();
        await forgotPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('rejects an invalid email format with 400', async () => {
        const req = createMockReq({ body: { email: 'not-an-email' } });
        const res = createMockRes();
        await forgotPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('returns the generic success message and sends nothing for an unknown email', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        const req = createMockReq({ body: { email: 'nobody@example.com' } });
        const res = createMockRes();
        await forgotPasswordHandler(req, res);

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
        const req = createMockReq({ body: { email: fakeUser.email } });
        const res = createMockRes();
        await forgotPasswordHandler(req, res);

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
        const req = createMockReq({ body: { email: fakeUser.email } });
        const res = createMockRes();
        await forgotPasswordHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
