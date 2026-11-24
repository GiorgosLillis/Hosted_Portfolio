import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const redis = vi.hoisted(() => ({ set: vi.fn(), getdel: vi.fn() }));
vi.mock('@upstash/redis', () => ({
    Redis: { fromEnv: () => redis },
}));

const resolveMx = vi.hoisted(() => vi.fn());
vi.mock('dns/promises', () => ({
    Resolver: class {
        resolveMx = resolveMx;
    },
}));

vi.mock('./mailer.js', () => ({
    sendEmail: vi.fn(),
}));

const { sendEmail } = await import('./mailer.js');
const { createEmailToken, consumeEmailToken, sendVerificationEmail, checkEmailDomain } = await import('./emailVerification.js');

const hashOf = (token) => crypto.createHash('sha256').update(token).digest('hex');

beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps queued one-time answers, an unused one would leak into the next test
    resolveMx.mockReset();
    redis.set.mockResolvedValue('OK');
});

describe('createEmailToken / consumeEmailToken', () => {
    it('stores only the hash of a random 64-character token, for 24 hours', async () => {
        const token = await createEmailToken('verify', 5, 'user@example.com');

        expect(token).toMatch(/^[a-f0-9]{64}$/);
        expect(redis.set).toHaveBeenCalledWith(`email_token:${hashOf(token)}`, { purpose: 'verify', userId: 5, email: 'user@example.com' }, { ex: 86400 });
    });

    it('keeps a deletion link usable for only an hour', async () => {
        const token = await createEmailToken('delete', 5, 'user@example.com');
        expect(redis.set).toHaveBeenCalledWith(`email_token:${hashOf(token)}`, { purpose: 'delete', userId: 5, email: 'user@example.com' }, { ex: 3600 });
    });

    it('reads and deletes the token in one step, so a link works once', async () => {
        const token = 'b'.repeat(64);
        redis.getdel.mockResolvedValue({ purpose: 'change', userId: 5, email: 'new@example.com' });

        expect(await consumeEmailToken(token)).toEqual({ purpose: 'change', userId: 5, email: 'new@example.com' });
        expect(redis.getdel).toHaveBeenCalledWith(`email_token:${hashOf(token)}`);
    });

    it('returns null for a token that is unknown, malformed or not a string, without asking Redis about malformed ones', async () => {
        redis.getdel.mockResolvedValue(null);
        expect(await consumeEmailToken('c'.repeat(64))).toBeNull();

        redis.getdel.mockClear();
        for (const bad of [undefined, null, 42, 'short', 'z'.repeat(64), { token: 'x' }]) {
            expect(await consumeEmailToken(bad)).toBeNull();
        }
        expect(redis.getdel).not.toHaveBeenCalled();
    });
});

describe('sendVerificationEmail', () => {
    it('links to the profile page with the token, with wording for a sign-up or an email change', async () => {
        const token = 'd'.repeat(64);
        await sendVerificationEmail('user@example.com', token, 'verify');
        await sendVerificationEmail('new@example.com', token, 'change');

        const [signUp, change] = sendEmail.mock.calls.map(([mail]) => mail);
        expect(signUp.to).toBe('user@example.com');
        expect(signUp.from).toContain(process.env.MAIL_FROM);
        expect(signUp.message).toContain(`/profile.html?verify=${token}`);
        expect(signUp.subject).toBe('Confirm your email address');
        expect(change.subject).toBe('Confirm your new email address');
        expect(change.message).toContain('old address stays in use');
    });

    it('warns in a deletion email that it cannot be undone, expires in an hour, and to change the password if unexpected', async () => {
        await sendVerificationEmail('user@example.com', 'f'.repeat(64), 'delete');
        const mail = sendEmail.mock.calls[0][0];
        expect(mail.subject).toBe('Confirm deleting your account');
        expect(mail.message).toContain('cannot be undone');
        expect(mail.message).toContain('expires in 1 hour');
        expect(mail.message).toContain('change your password');
    });
});

describe('checkEmailDomain', () => {
    it('accepts a domain with a mail server', async () => {
        resolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
        expect(await checkEmailDomain('user@example.com')).toBe('ok');
        expect(resolveMx).toHaveBeenCalledWith('example.com');
    });

    it('rejects a known throwaway service without a DNS lookup', async () => {
        expect(await checkEmailDomain('someone@mailinator.com')).toBe('disposable');
        expect(resolveMx).not.toHaveBeenCalled();
    });

    it('rejects a common typo domain that is on the throwaway list, like gmial.com', async () => {
        expect(await checkEmailDomain('user@gmial.com')).toBe('disposable');
    });

    it('rejects a domain that does not exist, has no mail server, or publishes a "null MX"', async () => {
        for (const code of ['ENOTFOUND', 'ENODATA']) {
            resolveMx.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
            expect(await checkEmailDomain('user@no-such-domain.invalid')).toBe('no-mail');
        }
        resolveMx.mockResolvedValueOnce([{ exchange: '.', priority: 0 }]);
        expect(await checkEmailDomain('user@no-mail.example')).toBe('no-mail');
    });

    it('lets the address through when DNS itself fails, since the link still has to be clicked', async () => {
        resolveMx.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }));
        expect(await checkEmailDomain('user@example.com')).toBe('ok');
    });
});
