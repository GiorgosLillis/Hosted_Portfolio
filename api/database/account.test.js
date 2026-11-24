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
    sendStatus: (res, status, code, message, extra = {}) => res.status(status).json({ success: status < 400, code, message, ...extra }),
    checkToken: vi.fn(),
    setAuthCookies: vi.fn(),
    clearAuthCookies: vi.fn(),
    setCorsHeaders: vi.fn(),
    getClientIp: vi.fn((req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress),
    // The real one from http.js, running on the mocked rateLimiter above
    enforceRateLimits: async (...args) => (await vi.importActual('../lib/http.js')).enforceRateLimits(...args),
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

// Real escaping and email normalizing, only the format checks are controlled by the tests
vi.mock('../lib/sanitize.js', async (importOriginal) => ({
    ...(await importOriginal()),
    isValidEmail: vi.fn(() => true),
    isValidPassword: vi.fn(() => true),
    isValidName: vi.fn(() => true),
}));

vi.mock('../lib/prisma.js', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
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

// The token store, the link email and the DNS lookup are tested in emailVerification.test.js
vi.mock('../lib/emailVerification.js', () => ({
    checkEmailDomain: vi.fn(),
    createEmailToken: vi.fn(),
    sendVerificationEmail: vi.fn(),
}));

const { checkToken } = await import('../lib/functions.js');
const { checkEmailDomain, createEmailToken, sendVerificationEmail } = await import('../lib/emailVerification.js');
const { isValidEmail, isValidPassword, isValidName } = await import('../lib/sanitize.js');
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
    checkEmailDomain.mockResolvedValue('ok');
    createEmailToken.mockResolvedValue('c'.repeat(64));
    sendVerificationEmail.mockResolvedValue(undefined);
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
                success: true,
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
            // The session user has no password hash, the handler reads it from the database
            fakeUser = { id: 1, email: validBody.email, tokenVersion: 0 };
            // By id: the password hash of the logged-in account. By email: whether a new address is already taken (it isn't).
            prisma.user.findUnique.mockImplementation(async ({ where }) => (where.id !== undefined ? { passwordHash: storedHash } : null));
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

        it('does not bump tokenVersion when the password is unchanged, but still clears the stale cached session', async () => {
            checkToken.mockResolvedValue(fakeUser);
            const req = createMockReq({ method: 'PUT', body: { ...validBody, password: '' } });
            const res = createMockRes();
            await accountHandler(req, res);

            const updateArgs = prisma.user.update.mock.calls[0][0];
            expect(updateArgs.data.tokenVersion).toBeUndefined();
            expect(redis.del).toHaveBeenCalledWith(`user_session:${fakeUser.id}`);
        });

        it('keeps the current email when a new one is entered, and sends the new address a confirmation link', async () => {
            checkToken.mockResolvedValue(fakeUser);
            const res = createMockRes();
            await accountHandler(createMockReq({ method: 'PUT', body: { ...validBody, email: 'New.Address@Example.com' } }), res);

            const updateArgs = prisma.user.update.mock.calls[0][0];
            expect(updateArgs.data.email).toBeUndefined();
            // Other devices are logged out when the change is confirmed, not now
            expect(updateArgs.data.tokenVersion).toBeUndefined();
            expect(createEmailToken).toHaveBeenCalledWith('change', fakeUser.id, 'new.address@example.com');
            expect(sendVerificationEmail).toHaveBeenCalledWith('new.address@example.com', 'c'.repeat(64), 'change');
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'email-change-pending', pendingEmail: 'new.address@example.com' }));
        });

        it('rejects a new address that is throwaway, cannot receive mail or is already taken, before changing anything', async () => {
            checkToken.mockResolvedValue(fakeUser);
            const cases = [
                () => checkEmailDomain.mockResolvedValueOnce('disposable'),
                () => checkEmailDomain.mockResolvedValueOnce('no-mail'),
                () => prisma.user.findUnique.mockImplementation(async ({ where }) => (where.id !== undefined ? { passwordHash: storedHash } : { id: 99 })),
            ];
            const expectedCodes = ['email-disposable', 'email-domain-invalid', 'email-exists'];

            for (const [index, arrange] of cases.entries()) {
                arrange();
                const res = createMockRes();
                await accountHandler(createMockReq({ method: 'PUT', body: { ...validBody, email: 'taken@example.com' } }), res);
                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: expectedCodes[index] }));
            }
            expect(prisma.user.update).not.toHaveBeenCalled();
            expect(sendVerificationEmail).not.toHaveBeenCalled();
        });

        it('saves the other changes but says so when the link to the new address cannot be sent', async () => {
            checkToken.mockResolvedValue(fakeUser);
            sendVerificationEmail.mockRejectedValueOnce(new Error('SMTP is down'));
            const res = createMockRes();
            await accountHandler(createMockReq({ method: 'PUT', body: { ...validBody, email: 'new.address@example.com' } }), res);

            expect(prisma.user.update).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'email-change-send-failed' }));
        });

        it('does not treat a different letter case of the same email as a change', async () => {
            checkToken.mockResolvedValue({ ...fakeUser, email: 'User@Example.com' });
            const res = createMockRes();
            await accountHandler(createMockReq({ method: 'PUT', body: validBody }), res);

            expect(sendVerificationEmail).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'user-updated' }));
        });

        it('tells the old address what changed and that the new address must confirm it, in full so a typo can be spotted', async () => {
            checkToken.mockResolvedValue(fakeUser);
            const req = createMockReq({ method: 'PUT', body: { ...validBody, email: 'new.address@example.com', password: 'NewStr0ng!Pass' } });
            await accountHandler(req, createMockRes());

            const mail = sendMail.mock.calls[0][0];
            expect(mail.to).toBe(fakeUser.email);
            expect(mail.html).toContain('new.address@example.com');
            expect(mail.html).toContain('takes effect once the link sent to that address is clicked');
            expect(mail.html).toContain('your password');
            expect(mail.html).toContain('logged out of your other devices');
        });

        it('does not mention a device logout when only the name changed', async () => {
            checkToken.mockResolvedValue({ ...fakeUser, firstName: 'Jon', lastName: 'Doe' });
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await accountHandler(req, res);

            const mail = sendMail.mock.calls[0][0];
            expect(mail.html).toContain('your name');
            expect(mail.html).not.toContain('logged out');
        });

        it('still returns 200 when clearing the cached session fails', async () => {
            checkToken.mockResolvedValue(fakeUser);
            redis.del.mockRejectedValueOnce(new Error('Redis is down'));
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('returns 401 when the account no longer exists in the database', async () => {
            checkToken.mockResolvedValue(fakeUser);
            prisma.user.findUnique.mockResolvedValue(null);
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it('also recognises the duplicate email error when the adapter gives only the message and no P2002 code', async () => {
            checkToken.mockResolvedValue(fakeUser);
            prisma.user.update.mockRejectedValue(new Error('duplicate key value violates unique constraint "users_email_key"'));
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await accountHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'email-exists' }));
        });

        it('returns 400 when the new email already belongs to another account', async () => {
            checkToken.mockResolvedValue(fakeUser);
            prisma.user.update.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
            const req = createMockReq({ method: 'PUT', body: validBody });
            const res = createMockRes();
            await accountHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'email-exists' }));
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
            prisma.user.findUnique.mockResolvedValue({ passwordHash: storedHash });
            prisma.user.delete.mockResolvedValue({});
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
            checkToken.mockResolvedValue({ id: 1 });
            const req = createMockReq({ method: 'DELETE', body: { password: 'WrongPass1!' } });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(prisma.user.delete).not.toHaveBeenCalled();
        });

        it('deletes nothing yet: emails the account a deletion link and keeps the session', async () => {
            checkToken.mockResolvedValue({ id: 1, email: 'user@example.com' });
            const res = createMockRes();
            await accountHandler(createMockReq({ method: 'DELETE', body: credentials }), res);

            expect(prisma.user.delete).not.toHaveBeenCalled();
            expect(createEmailToken).toHaveBeenCalledWith('delete', 1, 'user@example.com');
            expect(sendVerificationEmail).toHaveBeenCalledWith('user@example.com', 'c'.repeat(64), 'delete');
            expect(res.setHeader).not.toHaveBeenCalledWith('Set-Cookie', expect.anything());
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'delete-pending' }));
        });

        it('answers 500 and deletes nothing when the deletion email cannot be sent', async () => {
            checkToken.mockResolvedValue({ id: 1, email: 'user@example.com' });
            sendVerificationEmail.mockRejectedValueOnce(new Error('SMTP is down'));
            const res = createMockRes();
            await accountHandler(createMockReq({ method: 'DELETE', body: credentials }), res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(prisma.user.delete).not.toHaveBeenCalled();
        });

        it('returns 401 when the account no longer exists in the database', async () => {
            checkToken.mockResolvedValue({ id: 1 });
            prisma.user.findUnique.mockResolvedValue(null);
            const req = createMockReq({ method: 'DELETE', body: credentials });
            const res = createMockRes();
            await accountHandler(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(prisma.user.delete).not.toHaveBeenCalled();
        });
    });
});
