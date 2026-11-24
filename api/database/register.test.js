import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';

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
            update: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

const redis = vi.hoisted(() => ({ del: vi.fn() }));
vi.mock('@upstash/redis', () => ({
    Redis: { fromEnv: () => redis },
}));

vi.mock('../lib/mailer.js', () => ({
    sendEmail: vi.fn(),
}));

// The token store, the email and the DNS lookup are tested in emailVerification.test.js
vi.mock('../lib/emailVerification.js', () => ({
    VERIFY_DEADLINE_MS: 2 * 24 * 60 * 60 * 1000,
    checkEmailDomain: vi.fn(),
    createEmailToken: vi.fn(),
    consumeEmailToken: vi.fn(),
    sendVerificationEmail: vi.fn(),
}));

const { prisma } = await import('../lib/prisma.js');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const { sendEmail } = await import('../lib/mailer.js');
const { checkEmailDomain, createEmailToken, consumeEmailToken, sendVerificationEmail } = await import('../lib/emailVerification.js');
const registerHandler = (await import('./register.js')).default;

const validBody = {
    email: 'new@example.com',
    password: 'Str0ng!Pass',
    first_name: 'John',
    last_name: 'Doe',
};
const rawToken = 'a'.repeat(64);

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    checkEmailDomain.mockResolvedValue('ok');
    createEmailToken.mockResolvedValue(rawToken);
    sendVerificationEmail.mockResolvedValue(undefined);
    sendEmail.mockResolvedValue(undefined);
    redis.del.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({ id: 1, tokenVersion: 0, ...data }));
    prisma.user.update.mockResolvedValue({});
});

describe('register (sign-up)', () => {
    it('rejects non-POST methods with 405', async () => {
        const res = createMockRes();
        await registerHandler(createMockReq({ method: 'GET' }), res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('rejects when rate limited with 429', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 120 });
        const res = createMockRes();
        await registerHandler(createMockReq({ body: validBody }), res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('rejects invalid input (weak password) with 400', async () => {
        const res = createMockRes();
        await registerHandler(createMockReq({ body: { ...validBody, password: 'weak' } }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a throwaway address and a domain that cannot receive mail with 400', async () => {
        for (const [check, code] of [['disposable', 'email-disposable'], ['no-mail', 'email-domain-invalid']]) {
            checkEmailDomain.mockResolvedValueOnce(check);
            const res = createMockRes();
            await registerHandler(createMockReq({ body: validBody }), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code }));
        }
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects when the email is already registered with 400', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: validBody.email });
        const res = createMockRes();
        await registerHandler(createMockReq({ body: validBody }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'email-exists' }));
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('checks and stores the email in lowercase', async () => {
        await registerHandler(createMockReq({ body: { ...validBody, email: ' New@Example.com ' } }), createMockRes());
        expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'new@example.com' } });
        expect(prisma.user.create.mock.calls[0][0].data.email).toBe('new@example.com');
    });

    it('creates an unconfirmed account with a 2-day deadline, emails a link and logs nobody in', async () => {
        const before = Date.now();
        const res = createMockRes();
        await registerHandler(createMockReq({ body: validBody }), res);

        const data = prisma.user.create.mock.calls[0][0].data;
        expect(data.emailVerifiedAt).toBeUndefined();
        expect(data.verifyDeadline.getTime()).toBeGreaterThanOrEqual(before + 2 * 24 * 60 * 60 * 1000);
        expect(data.passwordHash).not.toBe(validBody.password);

        expect(createEmailToken).toHaveBeenCalledWith('verify', 1, 'new@example.com');
        expect(sendVerificationEmail).toHaveBeenCalledWith('new@example.com', rawToken, 'verify');
        expect(res.setHeader).not.toHaveBeenCalledWith('Set-Cookie', expect.anything());
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'verification-sent', email: 'new@example.com' }));
    });

    it('still creates the account when the email fails to send, and says so', async () => {
        sendVerificationEmail.mockRejectedValueOnce(new Error('SMTP is down'));
        const res = createMockRes();
        await registerHandler(createMockReq({ body: validBody }), res);

        expect(prisma.user.create).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'verification-send-failed' }));
    });

    it('returns 500 if the database throws unexpectedly', async () => {
        prisma.user.findUnique.mockRejectedValue(new Error('DB is down'));
        const res = createMockRes();
        await registerHandler(createMockReq({ body: validBody }), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('verify (redeeming a link)', () => {
    const verify = async (body = { token: rawToken }) => {
        const res = createMockRes();
        await registerHandler(createMockReq({ body, query: { action: 'verify' } }), res);
        return res;
    };

    it('rejects an unknown, used or expired token with 400', async () => {
        consumeEmailToken.mockResolvedValue(null);
        const res = await verify();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'verification-link-invalid' }));
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('confirms the account and removes its deletion deadline', async () => {
        consumeEmailToken.mockResolvedValue({ purpose: 'verify', userId: 1, email: 'new@example.com' });
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'new@example.com', emailVerifiedAt: null });
        const res = await verify();

        expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { emailVerifiedAt: expect.any(Date), verifyDeadline: null } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'email-verified' }));
    });

    it('does not confirm an account whose address changed since the link was sent', async () => {
        consumeEmailToken.mockResolvedValue({ purpose: 'verify', userId: 1, email: 'old@example.com' });
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'new@example.com', emailVerifiedAt: null });
        const res = await verify();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('applies a confirmed email change, logs every session out and tells the old address', async () => {
        consumeEmailToken.mockResolvedValue({ purpose: 'change', userId: 1, email: 'changed@example.com' });
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'old@example.com', emailVerifiedAt: new Date() });
        const res = await verify();

        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 1 },
            data: { email: 'changed@example.com', emailVerifiedAt: expect.any(Date), verifyDeadline: null, tokenVersion: { increment: 1 } },
        });
        expect(redis.del).toHaveBeenCalledWith('user_session:1');
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'old@example.com' }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'email-changed', email: 'changed@example.com' }));
    });

    it('reports a clash when another account took the new address in the meantime', async () => {
        consumeEmailToken.mockResolvedValue({ purpose: 'change', userId: 1, email: 'changed@example.com' });
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'old@example.com', emailVerifiedAt: new Date() });
        prisma.user.update.mockRejectedValue(new Error('duplicate key value violates unique constraint "users_email_key"'));
        const res = await verify();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'email-exists' }));
    });

    it('deletes the account from a deletion link, clears its cached session and logs this browser out', async () => {
        consumeEmailToken.mockResolvedValue({ purpose: 'delete', userId: 1, email: 'user@example.com' });
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'user@example.com', emailVerifiedAt: new Date() });
        prisma.user.delete.mockResolvedValue({});
        const res = await verify();

        expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        expect(redis.del).toHaveBeenCalledWith('user_session:1');
        expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.arrayContaining([expect.stringContaining('token=;')]));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'account-deleted' }));
    });

    it('ignores a deletion link sent to an address the account no longer has', async () => {
        consumeEmailToken.mockResolvedValue({ purpose: 'delete', userId: 1, email: 'old@example.com' });
        prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'new@example.com', emailVerifiedAt: new Date() });
        const res = await verify();

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('is rate limited per IP', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 60 });
        const res = await verify();
        expect(res.status).toHaveBeenCalledWith(429);
        expect(consumeEmailToken).not.toHaveBeenCalled();
    });
});

describe('resend (a new confirmation link)', () => {
    const resend = async (email) => {
        const res = createMockRes();
        await registerHandler(createMockReq({ body: { email }, query: { action: 'resend' } }), res);
        return res;
    };

    it('sends a new link to an account that is still unconfirmed', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 7, email: 'new@example.com', emailVerifiedAt: null });
        const res = await resend('New@Example.com');
        expect(createEmailToken).toHaveBeenCalledWith('verify', 7, 'new@example.com');
        expect(sendVerificationEmail).toHaveBeenCalledWith('new@example.com', rawToken, 'verify');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'verification-resent' }));
    });

    it('answers the same way, without sending, for confirmed or unknown addresses', async () => {
        prisma.user.findUnique.mockResolvedValueOnce({ id: 7, email: 'done@example.com', emailVerifiedAt: new Date() });
        const confirmed = await resend('done@example.com');
        prisma.user.findUnique.mockResolvedValueOnce(null);
        const unknown = await resend('nobody@example.com');

        expect(sendVerificationEmail).not.toHaveBeenCalled();
        for (const res of [confirmed, unknown]) {
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'verification-resent' }));
        }
    });

    it('rejects an invalid address with 400', async () => {
        const res = await resend('not-an-email');
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('cleanup (daily cron)', () => {
    it('refuses calls without the cron secret', async () => {
        const res = createMockRes();
        await registerHandler(createMockReq({ method: 'GET', query: { action: 'cleanup' } }), res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(prisma.user.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes only unconfirmed accounts past their deadline, never ones without a deadline', async () => {
        prisma.user.deleteMany.mockResolvedValue({ count: 3 });
        const res = createMockRes();
        await registerHandler(createMockReq({
            method: 'GET',
            query: { action: 'cleanup' },
            headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }), res);

        // "lt" on a date never matches a missing deadline, so accounts from before verification are safe
        expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: { emailVerifiedAt: null, verifyDeadline: { lt: expect.any(Date) } } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'cleanup-done', count: 3 }));
    });
});
