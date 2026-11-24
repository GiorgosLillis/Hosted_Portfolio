import { describe, it, expect } from 'vitest';
import { isValidCronAuthorization, isAllowedPushEndpoint } from './push.js';

describe('isValidCronAuthorization', () => {
    it('accepts the exact bearer secret', () => {
        expect(isValidCronAuthorization('Bearer s3cret', 's3cret')).toBe(true);
    });

    it('rejects a wrong secret, a missing prefix and different lengths without throwing', () => {
        expect(isValidCronAuthorization('Bearer wrong', 's3cret')).toBe(false);
        expect(isValidCronAuthorization('s3cret', 's3cret')).toBe(false);
        expect(isValidCronAuthorization('Bearer s3cret and more', 's3cret')).toBe(false);
        expect(isValidCronAuthorization('', 's3cret')).toBe(false);
    });

    it('rejects when the header or the configured secret is missing', () => {
        expect(isValidCronAuthorization(undefined, 's3cret')).toBe(false);
        expect(isValidCronAuthorization(null, 's3cret')).toBe(false);
        expect(isValidCronAuthorization('Bearer ', '')).toBe(false);
        expect(isValidCronAuthorization('Bearer undefined', undefined)).toBe(false);
    });
});

describe('isAllowedPushEndpoint', () => {
    it.each([
        'https://fcm.googleapis.com/fcm/send/abc',
        'https://fcm.googleapis.com/wp/abc',
        'https://updates.push.services.mozilla.com/wpush/v2/abc',
        'https://web.push.apple.com/abc',
        'https://wns2-par02p.notify.windows.com/w/?token=abc',
        'https://FCM.GOOGLEAPIS.COM/fcm/send/abc',
        'https://fcm.googleapis.com:443/fcm/send/abc',
    ])('allows %s', (endpoint) => {
        expect(isAllowedPushEndpoint(endpoint)).toBe(true);
    });

    it.each([
        ['an unrelated host', 'https://evil.example.com/collect'],
        ['the push host as a prefix of another domain', 'https://fcm.googleapis.com.evil.com/fcm/send/abc'],
        ['the push host as a path', 'https://evil.com/fcm.googleapis.com/fcm/send/abc'],
        ['a suffix without the leading dot', 'https://evilnotify.windows.com/x'],
        ['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
        ['embedded credentials', 'https://user:secret@fcm.googleapis.com/fcm/send/abc'],
        ['a non-standard port', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
        ['an internal address', 'https://169.254.169.254/latest/meta-data'],
        ['localhost', 'https://localhost/x'],
        ['text that is not a URL', 'not-a-url'],
        ['an empty string', ''],
    ])('rejects %s', (_label, endpoint) => {
        expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    });

    it('rejects values that are not strings', () => {
        for (const value of [undefined, null, 42, {}, ['https://fcm.googleapis.com/x']]) {
            expect(isAllowedPushEndpoint(value)).toBe(false);
        }
    });
});
