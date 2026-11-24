import crypto from 'crypto';
import { Resolver } from 'dns/promises';
import { Redis } from '@upstash/redis';
import { isDisposableEmail } from 'disposable-email-domains-js';
import { sendEmail } from './mailer.js';

const redis = Redis.fromEnv();

// A confirmation link stays usable for a day ("resend" makes a new one), a deletion link only for an hour.
// New sign-ups are deleted if still unconfirmed after 2 days.
const EMAIL_TOKEN_TTL_SECONDS = { verify: 24 * 60 * 60, change: 24 * 60 * 60, delete: 60 * 60 };
export const VERIFY_DEADLINE_MS = 2 * 24 * 60 * 60 * 1000;

// 'verify' confirms the address an account signed up with, 'change' confirms the new address of an email change,
// 'delete' confirms that the owner of the inbox really wants the account gone
export type EmailTokenPurpose = 'verify' | 'change' | 'delete';

export interface EmailTokenPayload {
    purpose: EmailTokenPurpose;
    userId: number;
    email: string;
}

// Only the hash is stored, the raw token only ever exists in the emailed link (same as password reset links)
const tokenKey = (rawToken: string) => `email_token:${crypto.createHash('sha256').update(rawToken).digest('hex')}`;

export async function createEmailToken(purpose: EmailTokenPurpose, userId: number, email: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    await redis.set(tokenKey(rawToken), { purpose, userId, email }, { ex: EMAIL_TOKEN_TTL_SECONDS[purpose] });
    return rawToken;
}

// Single use: GETDEL reads and deletes in one step, so the same link can't be redeemed twice
export async function consumeEmailToken(rawToken: unknown): Promise<EmailTokenPayload | null> {
    if (typeof rawToken !== 'string' || !/^[a-f0-9]{64}$/.test(rawToken)) {
        return null;
    }
    return (await redis.getdel<EmailTokenPayload>(tokenKey(rawToken))) ?? null;
}

const EMAIL_TEXT: Record<EmailTokenPurpose, { subject: string; intro: string; expiry: string; ignore: string }> = {
    verify: {
        subject: 'Confirm your email address',
        intro: 'Confirm your email address to finish creating your account. You can log in once it is confirmed.',
        expiry: 'The link works once and expires in 24 hours.',
        ignore: 'If you did not ask for this, you can ignore this email.',
    },
    change: {
        subject: 'Confirm your new email address',
        intro: 'Confirm this address to make it the new email of your account. Until then your old address stays in use.',
        expiry: 'The link works once and expires in 24 hours.',
        ignore: 'If you did not ask for this, you can ignore this email.',
    },
    delete: {
        subject: 'Confirm deleting your account',
        intro: 'Someone asked to delete your account, with its favorite places and shopping list. Click the link to delete it for good. This cannot be undone.',
        expiry: 'The link works once and expires in 1 hour.',
        ignore: 'If you did not ask for this, ignore this email and nothing will be deleted, but change your password, since whoever asked knew it.',
    },
};

export async function sendVerificationEmail(to: string, rawToken: string, purpose: EmailTokenPurpose) {
    const link = `${process.env.FRONTEND_URL}/profile.html?verify=${rawToken}`;
    const text = EMAIL_TEXT[purpose];
    await sendEmail({
        from: `"Account Security" <${process.env.MAIL_FROM}>`,
        to,
        subject: text.subject,
        message: `<p>${text.intro}</p><p><a href="${link}">${link}</a></p><p>${text.expiry} ${text.ignore}</p>`,
    });
}

const resolver = new Resolver({ timeout: 3000, tries: 1 });

export type EmailDomainCheck = 'ok' | 'disposable' | 'no-mail';

// Rejects throwaway services and domains that can't receive mail, so a typo like "gmial.com" is caught at once.
// A DNS timeout or server failure lets the address through: our resolver having a bad moment is not the user's fault,
// and the confirmation link still proves the address works.
export async function checkEmailDomain(email: string): Promise<EmailDomainCheck> {
    if (isDisposableEmail(email)) {
        return 'disposable';
    }
    const domain = email.slice(email.lastIndexOf('@') + 1);
    try {
        const records = await resolver.resolveMx(domain);
        // A "null MX" (exchange ".") is a domain saying it accepts no mail at all
        return records.some((record) => record.exchange && record.exchange !== '.') ? 'ok' : 'no-mail';
    } catch (error) {
        const code = (error as { code?: string }).code;
        return code === 'ENOTFOUND' || code === 'ENODATA' ? 'no-mail' : 'ok';
    }
}
