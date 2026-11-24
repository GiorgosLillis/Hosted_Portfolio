import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from './testUtils/mockReqRes.js';

vi.mock('./lib/recaptcha.js', () => ({
    recaptchaMiddleware: (req, res, next) => next(),
}));

vi.mock('./lib/rateLimiter.js', () => ({
    rateLimiter: vi.fn().mockResolvedValue({ allowed: true, ttl: 0 }),
}));

vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({
            sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
        })),
    },
}));

const nodemailer = (await import('nodemailer')).default;
const { rateLimiter } = await import('./lib/rateLimiter.js');
const emailHandler = (await import('./email.js')).default;

const sendMail = nodemailer.createTransport.mock.results[0].value.sendMail;

const validBody = {
    email: 'sender@example.com',
    subject: 'Hello',
    message: 'This is a test message.',
};

beforeEach(() => {
    rateLimiter.mockClear();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    sendMail.mockClear();
    sendMail.mockResolvedValue({ messageId: 'test-id' });
});

describe('email handler (contact form)', () => {
    it('rejects non-POST methods with 405', async () => {
        const req = createMockReq({ method: 'GET' });
        const res = createMockRes();
        await emailHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('rejects when rate limited with 429', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 30 });
        const req = createMockReq({ body: validBody });
        const res = createMockRes();
        await emailHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 30);
    });

    it('rate-limits on its own key, not one shared with the weather endpoint', async () => {
        const req = createMockReq({ body: validBody, headers: { 'x-forwarded-for': '9.9.9.9' } });
        await emailHandler(req, createMockRes());
        expect(rateLimiter).toHaveBeenCalledWith('contact_attempt_ip:9.9.9.9', 5, 60);
    });

    it('rejects when required fields are missing with 400', async () => {
        const req = createMockReq({ body: { email: validBody.email } });
        const res = createMockRes();
        await emailHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('rejects an invalid email address with 400', async () => {
        const req = createMockReq({ body: { ...validBody, email: 'not-an-email' } });
        const res = createMockRes();
        await emailHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('rejects an email address containing HTML characters with 400', async () => {
        const req = createMockReq({ body: { ...validBody, email: '<b>x</b>@example.com' } });
        const res = createMockRes();
        await emailHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('rejects a subject over 100 characters with 400', async () => {
        const req = createMockReq({ body: { ...validBody, subject: 'a'.repeat(101) } });
        const res = createMockRes();
        await emailHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects a message over 2000 characters with 400', async () => {
        const req = createMockReq({ body: { ...validBody, message: 'a'.repeat(2001) } });
        const res = createMockRes();
        await emailHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('accepts a message of exactly 2000 characters', async () => {
        const req = createMockReq({ body: { ...validBody, message: 'a'.repeat(2000) } });
        const res = createMockRes();
        await emailHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('sends the email and returns 200 on success', async () => {
        const req = createMockReq({ body: validBody });
        const res = createMockRes();
        await emailHandler(req, res);

        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: process.env.CONTACT_TO,
                replyTo: validBody.email,
                subject: expect.stringContaining(validBody.subject),
            })
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 when sending the email fails', async () => {
        sendMail.mockRejectedValueOnce(new Error('SMTP is down'));
        const req = createMockReq({ body: validBody });
        const res = createMockRes();
        await emailHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
