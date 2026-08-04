import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('@upstash/redis', () => ({
    Redis: {
        fromEnv: vi.fn(() => ({
            get: vi.fn(),
            set: vi.fn(),
        })),
    },
}));

vi.mock('./prisma.js', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
        },
    },
}));

const { Redis } = await import('@upstash/redis');
const { prisma } = await import('./prisma.js');
const { checkToken, isValidEmail, isValidPassword, isValidName, getClientIp } = await import('./functions.js');

const redis = Redis.fromEnv.mock.results[0].value;

function signToken(payload, options = {}) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d', ...options });
}

function reqWithToken(token) {
    return { headers: { cookie: `token=${token}` } };
}

const fakeUser = { id: 1, email: 'user@example.com', tokenVersion: 3 };

beforeEach(() => {
    vi.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');
    prisma.user.findUnique.mockResolvedValue(fakeUser);
});

describe('getClientIp', () => {
    it('prefers the x-forwarded-for header when present', () => {
        const req = { headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '5.6.7.8' } };
        expect(getClientIp(req)).toBe('1.2.3.4');
    });

    it('falls back to the socket address when the header is missing', () => {
        const req = { headers: {}, socket: { remoteAddress: '5.6.7.8' } };
        expect(getClientIp(req)).toBe('5.6.7.8');
    });
});

describe('isValidEmail', () => {
    it('accepts a well-formed email', () => {
        expect(isValidEmail('a@b.com')).toBe(true);
    });

    it('rejects a missing value', () => {
        expect(isValidEmail(undefined)).toBe(false);
        expect(isValidEmail('')).toBe(false);
    });

    it('rejects a malformed email', () => {
        expect(isValidEmail('not-an-email')).toBe(false);
    });
});

describe('isValidPassword', () => {
    it('accepts a password meeting all complexity rules', () => {
        expect(isValidPassword('Curr3nt!Pass')).toBe(true);
    });

    it('rejects a missing value', () => {
        expect(isValidPassword(undefined)).toBe(false);
        expect(isValidPassword('')).toBe(false);
    });

    it('rejects a password missing required complexity (too short/no special char)', () => {
        expect(isValidPassword('weak')).toBe(false);
        expect(isValidPassword('NoSpecialChar1')).toBe(false);
    });
});

describe('isValidName', () => {
    it('accepts a well-formed name', () => {
        expect(isValidName('John')).toBe(true);
        expect(isValidName("O'Brien")).toBe(true);
    });

    it('rejects a missing value', () => {
        expect(isValidName(undefined)).toBe(false);
        expect(isValidName('')).toBe(false);
    });

    it('rejects a name with digits', () => {
        expect(isValidName('John3')).toBe(false);
    });

    it('rejects a name over 50 characters', () => {
        expect(isValidName('a'.repeat(51))).toBe(false);
    });
});

describe('checkToken', () => {
    it('throws when there is no cookie at all', async () => {
        await expect(checkToken({ headers: {} })).rejects.toThrow('Invalid or expired token.');
    });

    it('throws when the token has a bad signature', async () => {
        const badToken = jwt.sign({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion }, 'wrong-secret');
        await expect(checkToken(reqWithToken(badToken))).rejects.toThrow('Invalid or expired token.');
    });

    it('throws when the token is expired', async () => {
        const expiredToken = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion }, { expiresIn: '-1s' });
        await expect(checkToken(reqWithToken(expiredToken))).rejects.toThrow('Invalid or expired token.');
    });

    describe('cache-hit path', () => {
        it('returns the cached user when tokenVersion matches', async () => {
            redis.get.mockResolvedValue(fakeUser);
            const token = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion });

            const result = await checkToken(reqWithToken(token));

            expect(result).toEqual(fakeUser);
            expect(prisma.user.findUnique).not.toHaveBeenCalled();
        });

        it('rejects a token whose version does not match the cached user (revoked token)', async () => {
            redis.get.mockResolvedValue(fakeUser);
            const staleToken = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion - 1 });

            await expect(checkToken(reqWithToken(staleToken))).rejects.toThrow('Invalid or expired token.');
            expect(prisma.user.findUnique).not.toHaveBeenCalled();
        });
    });

    describe('DB-fallback path (cache miss)', () => {
        it('returns the user and caches it when tokenVersion matches', async () => {
            const token = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion });

            const result = await checkToken(reqWithToken(token));

            expect(result).toEqual(fakeUser);
            expect(redis.set).toHaveBeenCalledWith(`user_session:${fakeUser.id}`, fakeUser, { ex: 300 });
        });

        it('rejects a token whose version does not match the DB user (revoked token)', async () => {
            const staleToken = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion - 1 });

            await expect(checkToken(reqWithToken(staleToken))).rejects.toThrow('Invalid or expired token.');
            expect(redis.set).not.toHaveBeenCalled();
        });

        it('throws when the user no longer exists', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            const token = signToken({ userId: 999, tokenVersion: 0 });

            await expect(checkToken(reqWithToken(token))).rejects.toThrow('User specified in token not found');
        });
    });

    it('still applies the tokenVersion check via the DB when the Redis read fails', async () => {
        redis.get.mockRejectedValue(new Error('Redis is down'));
        const staleToken = signToken({ userId: fakeUser.id, tokenVersion: fakeUser.tokenVersion - 1 });

        await expect(checkToken(reqWithToken(staleToken))).rejects.toThrow('Invalid or expired token.');
    });

    it('throws when JWT_SECRET is not configured', async () => {
        const original = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;

        await expect(checkToken(reqWithToken('irrelevant'))).rejects.toThrow('JWT_SECRET is not configured on the server');

        process.env.JWT_SECRET = original;
    });
});
