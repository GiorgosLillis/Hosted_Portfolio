import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
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
            update: vi.fn(),
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

vi.mock('../lib/mailer.js', () => ({
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
}));

vi.mock('../lib/emailVerification.js', () => ({
    createEmailToken: vi.fn(),
    sendVerificationEmail: vi.fn(),
}));

const { prisma } = await import('../lib/prisma.js');
const { createEmailToken, sendVerificationEmail } = await import('../lib/emailVerification.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const { Redis } = await import('@upstash/redis');
const { sendEmail } = await import('../lib/mailer.js');
const loginHandler = (await import('./login.js')).default;

// functions.js (imported by login.js, left unmocked) creates its own Redis.fromEnv()
// instance internally as a dependency - it's evaluated before login.js's own top-level
const redis = Redis.fromEnv.mock.results[1].value;

const credentials = { email: 'user@example.com', password: 'Str0ng!Pass' };

let storedHash;

beforeEach(async () => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    storedHash = await bcrypt.hash(credentials.password, 10);
    prisma.user.update.mockResolvedValue({});
    redis.set.mockResolvedValue('OK');
    sendEmail.mockResolvedValue({ messageId: 'test-id' });
    createEmailToken.mockResolvedValue('e'.repeat(64));
    sendVerificationEmail.mockResolvedValue(undefined);
});

describe('login handler', () => {
    it('rejects non-POST methods wtih 405', async () => {
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await loginHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('rejects when rate limited by IP or email with 429', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 60 });
        const req = createMockReq({ body: credentials });
        const res = createMockRes();
        await loginHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    describe('failed-login notification email', () => {
        // Both rateLimiter calls need to resolve "not allowed" to trip the username-based
        // lockout specifically (the IP-only case above never reaches the notification code)
        function mockUsernameLockout() {
            rateLimiter.mockResolvedValue({ allowed: false, ttl: 900 });
        }

        it('sends a notification the first time the account gets locked out', async () => {
            mockUsernameLockout();
            prisma.user.findUnique.mockResolvedValue({ id: 1, email: credentials.email });
            redis.set.mockResolvedValue('OK'); // NX succeeded - first lockout this window

            const req = createMockReq({ body: credentials });
            const res = createMockRes();
            await loginHandler(req, res);

            expect(redis.set).toHaveBeenCalledWith(
                `login_failure_notified:${credentials.email}`,
                '1',
                { ex: 900, nx: true }
            );
            expect(sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({ to: credentials.email, subject: expect.any(String) })
            );
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('does not send a second notification while already locked out', async () => {
            mockUsernameLockout();
            prisma.user.findUnique.mockResolvedValue({ id: 1, email: credentials.email });
            redis.set.mockResolvedValue(null); // NX blocked - already notified this window

            const req = createMockReq({ body: credentials });
            const res = createMockRes();
            await loginHandler(req, res);

            expect(sendEmail).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('does not email an address with no matching account', async () => {
            mockUsernameLockout();
            prisma.user.findUnique.mockResolvedValue(null);
            redis.set.mockResolvedValue('OK');

            const req = createMockReq({ body: credentials });
            const res = createMockRes();
            await loginHandler(req, res);

            expect(sendEmail).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(429);
        });

        it('still returns 429 even if sending the notification fails', async () => {
            mockUsernameLockout();
            prisma.user.findUnique.mockResolvedValue({ id: 1, email: credentials.email });
            redis.set.mockResolvedValue('OK');
            sendEmail.mockRejectedValue(new Error('SMTP is down'));

            const req = createMockReq({ body: credentials });
            const res = createMockRes();
            await loginHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(429);
        });
    });

    it('rejects invalid input format with 400', async () => {
        const req = createMockReq({ body: { email: 'not-an-email', password: 'x' } });
        const res = createMockRes();
        await loginHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects when the user does not exist with 400', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        const req = createMockReq({ body: credentials });
        const res = createMockRes();
        await loginHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Invalid credentials.' })
        );
    });

    it('rejects when the password does not match with 400', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: credentials.email, passwordHash: storedHash });
        const req = createMockReq({ body: { ...credentials, password: 'WrongPass1!' } });
        const res = createMockRes();
        await loginHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('looks the account up by the trimmed, lowercase email and rate-limits on that form too', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: credentials.email, passwordHash: storedHash, tokenVersion: 0, emailVerifiedAt: new Date() });
        const req = createMockReq({ body: { email: '  User@Example.COM ', password: credentials.password } });
        const res = createMockRes();
        await loginHandler(req, res);

        expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
        expect(rateLimiter).toHaveBeenCalledWith('login_attempt_username:user@example.com', 5, 900);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('refuses an unconfirmed account with 403, no cookie, and emails it a new confirmation link', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: credentials.email, passwordHash: storedHash, tokenVersion: 0, emailVerifiedAt: null });
        const res = createMockRes();
        await loginHandler(createMockReq({ body: credentials }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.setHeader).not.toHaveBeenCalledWith('Set-Cookie', expect.anything());
        expect(redis.set).toHaveBeenCalledWith('verification_auto_sent:1', '1', { ex: 600, nx: true });
        expect(createEmailToken).toHaveBeenCalledWith('verify', 1, credentials.email);
        expect(sendVerificationEmail).toHaveBeenCalledWith(credentials.email, 'e'.repeat(64), 'verify');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'email-not-verified-sent' }));
    });

    it('sends at most one automatic link per 10 minutes, after that only the resend button sends', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: credentials.email, passwordHash: storedHash, tokenVersion: 0, emailVerifiedAt: null });
        redis.set.mockResolvedValue(null); // NX: a link already went out in this window
        const res = createMockRes();
        await loginHandler(createMockReq({ body: credentials }), res);

        expect(sendVerificationEmail).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'email-not-verified' }));
    });

    it('still answers 403 (without the "sent" wording) when the link fails to send', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: credentials.email, passwordHash: storedHash, tokenVersion: 0, emailVerifiedAt: null });
        sendVerificationEmail.mockRejectedValueOnce(new Error('SMTP is down'));
        const res = createMockRes();
        await loginHandler(createMockReq({ body: credentials }), res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'email-not-verified' }));
    });

    it('does not reveal that an unconfirmed account exists to someone with the wrong password', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: credentials.email, passwordHash: storedHash, emailVerifiedAt: null });
        const res = createMockRes();
        await loginHandler(createMockReq({ body: { ...credentials, password: 'WrongPass1!' } }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid-credentials' }));
        expect(sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('logs in successfully and sets an auth cookie', async () => {
        prisma.user.findUnique.mockResolvedValue({
            id: 1,
            email: credentials.email,
            passwordHash: storedHash,
            firstName: 'John',
            lastName: 'Doe',
            tokenVersion: 5,
            emailVerifiedAt: new Date(),
        });

        const req = createMockReq({ body: credentials });
        const res = createMockRes();
        await loginHandler(req, res);

        expect(prisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 1 } })
        );
        expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.any(Array));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('signs the JWT with the account\'s current tokenVersion', async () => {
        prisma.user.findUnique.mockResolvedValue({
            id: 1,
            email: credentials.email,
            passwordHash: storedHash,
            firstName: 'John',
            lastName: 'Doe',
            tokenVersion: 5,
            emailVerifiedAt: new Date(),
        });

        const req = createMockReq({ body: credentials });
        const res = createMockRes();
        await loginHandler(req, res);

        const decoded = decodeTokenFromResponse(res);
        expect(decoded.tokenVersion).toBe(5);
        expect(decoded.userId).toBe(1);
    });

    it('returns 500 if the database throws unexpectedly', async () => {
        prisma.user.findUnique.mockRejectedValue(new Error('DB is down'));
        const req = createMockReq({ body: credentials });
        const res = createMockRes();
        await loginHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
