import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';

function decodeTokenFromResponse(res) {
    const setCookieCall = res.setHeader.mock.calls.find(call => call[0] === 'Set-Cookie');
    const tokenCookie = setCookieCall[1].find(cookieStr => cookieStr.startsWith('token='));
    const rawToken = tokenCookie.split('token=')[1].split(';')[0];
    return jwt.decode(rawToken);
}

function signToken(payload, options = {}) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d', ...options });
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

// functions.js (checkToken, setAuthCookies, setCorsHeaders, getClientIp) is left unmocked
// on purpose - this exercises the real token verification + re-issue flow end to end,
// same approach login.test.js uses.
const { prisma } = await import('../lib/prisma.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const { Redis } = await import('@upstash/redis');
const nodemailer = (await import('nodemailer')).default;
const logoutDevicesHandler = (await import('./logoutDevices.js')).default;

// functions.js and logoutDevices.js each call Redis.fromEnv() independently -
// functions.js's instance (used internally by checkToken) is created first since it's
// evaluated as a dependency before logoutDevices.js's own top-level code runs.
const functionsRedis = Redis.fromEnv.mock.results[0].value;
const redis = Redis.fromEnv.mock.results[1].value;
const sendMail = nodemailer.createTransport.mock.results[0].value.sendMail;

const fakeUser = { id: 1, email: 'user@example.com', tokenVersion: 3 };

function reqWithToken(token) {
    return createMockReq({ method: 'POST', headers: { cookie: `token=${token}` } });
}

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    functionsRedis.get.mockResolvedValue(null); // force checkToken's DB-fallback path
    redis.del.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue(fakeUser);
    prisma.user.update.mockResolvedValue({ ...fakeUser, tokenVersion: fakeUser.tokenVersion + 1 });
    sendMail.mockResolvedValue({ messageId: 'test-id' });
});

describe('logoutDevices handler', () => {
    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await logoutDevicesHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects non-POST methods with 405', async () => {
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await logoutDevicesHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('returns 401 when there is no token', async () => {
        const req = createMockReq({ method: 'POST' });
        const res = createMockRes();
        await logoutDevicesHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 for an invalid/expired token instead of 500', async () => {
        const req = reqWithToken('not-a-real-token');
        const res = createMockRes();
        await logoutDevicesHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects when rate limited with 429', async () => {
        const token = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion });
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 30 });
        const req = reqWithToken(token);
        const res = createMockRes();
        await logoutDevicesHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('bumps tokenVersion, clears the cached session, and re-issues a valid cookie', async () => {
        const token = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion });
        const req = reqWithToken(token);
        const res = createMockRes();

        await logoutDevicesHandler(req, res);

        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: fakeUser.id },
            data: { tokenVersion: { increment: 1 } },
        });
        expect(redis.del).toHaveBeenCalledWith(`user_session:${fakeUser.id}`);
        expect(res.status).toHaveBeenCalledWith(200);

        const decoded = decodeTokenFromResponse(res);
        expect(decoded.tokenVersion).toBe(fakeUser.tokenVersion + 1);
    });

    it('the re-issued token keeps the current session valid (does not log the current device out)', async () => {
        const token = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion });
        const req = reqWithToken(token);
        const res = createMockRes();

        await logoutDevicesHandler(req, res);

        const decoded = decodeTokenFromResponse(res);
        const updatedUser = await prisma.user.update.mock.results[0].value;
        expect(decoded.tokenVersion).toBe(updatedUser.tokenVersion);
    });

    it('still returns 200 when the confirmation email fails to send', async () => {
        const token = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion });
        sendMail.mockRejectedValueOnce(new Error('SMTP is down'));
        const req = reqWithToken(token);
        const res = createMockRes();

        await logoutDevicesHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('still returns 200 when clearing the Redis cache fails', async () => {
        const token = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion });
        redis.del.mockRejectedValueOnce(new Error('Redis is down'));
        const req = reqWithToken(token);
        const res = createMockRes();

        await logoutDevicesHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 if the database throws unexpectedly', async () => {
        const token = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion });
        prisma.user.update.mockRejectedValue(new Error('DB is down'));
        const req = reqWithToken(token);
        const res = createMockRes();

        await logoutDevicesHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});
