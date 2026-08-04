import { vi } from 'vitest';

export function createMockReq({ method = 'POST', body = {}, headers = {}, query = {} } = {}) {
    return {
        method,
        body,
        headers: { 'g-recaptcha-response': 'test-token', cookie: '', ...headers },
        query,
        socket: { remoteAddress: '127.0.0.1' },
    };
}

export function createMockRes() {
    const res = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.end = vi.fn().mockReturnValue(res);
    res.setHeader = vi.fn().mockReturnValue(res);
    return res;
}
