import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { createMockReq } from '../testUtils/mockReqRes.js';

const redis = vi.hoisted(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
    Redis: { fromEnv: () => redis },
}));

vi.mock('./prisma.js', () => ({
    prisma: { user: { findUnique: vi.fn() } },
}));

const { prisma } = await import('./prisma.js');
const { checkToken, setCorsHeaders } = await import('./functions.js');

const dbUser = {
    id: 1,
    email: 'user@example.com',
    passwordHash: '$2a$10$thisIsAFakeHashThatMustNeverBeCached',
    firstName: 'John',
    lastName: 'Doe',
    tokenVersion: 3,
    emailVerifiedAt: new Date('2024-01-02'),
    createdAt: new Date('2024-01-01'),
    lastLoginAt: null,
};

function requestWithToken(overrides = {}) {
    const token = jwt.sign({ userId: 1, email: dbUser.email, tokenVersion: 3, ...overrides }, process.env.JWT_SECRET);
    return createMockReq({ headers: { cookie: `token=${token}` } });
}

beforeEach(() => {
    vi.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');
    prisma.user.findUnique.mockResolvedValue(dbUser);
});

describe('checkToken', () => {
    it('rejects a request without the auth cookie', async () => {
        await expect(checkToken(createMockReq({ headers: {} }))).rejects.toThrow('Invalid or expired token.');
    });

    it('rejects a token signed with another secret', async () => {
        const forged = jwt.sign({ userId: 1, tokenVersion: 3 }, 'some-other-secret');
        const req = createMockReq({ headers: { cookie: `token=${forged}` } });
        await expect(checkToken(req)).rejects.toThrow('Invalid or expired token.');
    });

    it('loads the user from the database on a cache miss and returns it without the password hash', async () => {
        const user = await checkToken(requestWithToken());

        expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
        expect(user).toMatchObject({ id: 1, email: dbUser.email, firstName: 'John', tokenVersion: 3 });
        expect(user).not.toHaveProperty('passwordHash');
    });

    it('caches the user for 5 minutes, never including the password hash', async () => {
        await checkToken(requestWithToken());

        expect(redis.set).toHaveBeenCalledTimes(1);
        const [key, cached, options] = redis.set.mock.calls[0];
        expect(key).toBe('user_session:1');
        expect(options).toEqual({ ex: 300 });
        expect(cached).toMatchObject({ id: 1, email: dbUser.email });
        expect(cached).not.toHaveProperty('passwordHash');
    });

    it('uses the cached user without touching the database', async () => {
        const { passwordHash, ...cachedUser } = dbUser;
        redis.get.mockResolvedValue(cachedUser);

        const user = await checkToken(requestWithToken());

        expect(prisma.user.findUnique).not.toHaveBeenCalled();
        expect(user).toMatchObject({ id: 1, tokenVersion: 3 });
    });

    it('rejects when the token version no longer matches the cached user (logged out everywhere)', async () => {
        const { passwordHash, ...cachedUser } = dbUser;
        redis.get.mockResolvedValue({ ...cachedUser, tokenVersion: 4 });

        await expect(checkToken(requestWithToken())).rejects.toThrow('Invalid or expired token.');
    });

    it('rejects when the token version no longer matches the database', async () => {
        prisma.user.findUnique.mockResolvedValue({ ...dbUser, tokenVersion: 4 });

        await expect(checkToken(requestWithToken())).rejects.toThrow('Invalid or expired token.');
        expect(redis.set).not.toHaveBeenCalled();
    });

    it('falls back to the database when Redis cannot be read, and still works when it cannot be written', async () => {
        redis.get.mockRejectedValue(new Error('Redis is down'));
        redis.set.mockRejectedValue(new Error('Redis is down'));

        const user = await checkToken(requestWithToken());

        expect(prisma.user.findUnique).toHaveBeenCalled();
        expect(user.id).toBe(1);
    });

    it('treats a token for a user that no longer exists like any other invalid token, so it ends as a 401', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(checkToken(requestWithToken())).rejects.toThrow('Invalid or expired token.');
    });

    it('ends the session of an account whose email is not confirmed, from the database or from the cache', async () => {
        prisma.user.findUnique.mockResolvedValue({ ...dbUser, emailVerifiedAt: null });
        await expect(checkToken(requestWithToken())).rejects.toThrow('Invalid or expired token.');

        const { passwordHash, ...cachedUser } = dbUser;
        redis.get.mockResolvedValue({ ...cachedUser, emailVerifiedAt: null });
        await expect(checkToken(requestWithToken())).rejects.toThrow('Invalid or expired token.');
    });

    it('only accepts tokens signed with HS256', async () => {
        const hs512 = jwt.sign({ userId: 1, email: dbUser.email, tokenVersion: 3 }, process.env.JWT_SECRET, { algorithm: 'HS512' });
        const req = createMockReq({ headers: { cookie: `token=${hs512}` } });

        await expect(checkToken(req)).rejects.toThrow('Invalid or expired token.');
    });
});

describe('setCorsHeaders', () => {
    it('marks responses as not cacheable by default, since they usually carry private data', () => {
        const res = { setHeader: vi.fn() };
        setCorsHeaders(res);

        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });

    it('lets an endpoint that sets its own caching afterwards override it', () => {
        const headers = {};
        const res = { setHeader: (name, value) => { headers[name] = value; } };
        setCorsHeaders(res);
        res.setHeader('Cache-Control', 'public, s-maxage=3600');

        expect(headers['Cache-Control']).toBe('public, s-maxage=3600');
    });
});
