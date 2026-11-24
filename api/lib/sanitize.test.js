import { describe, it, expect } from 'vitest';
import { normalizeEmail } from './sanitize.js';

describe('normalizeEmail', () => {
    it('lowercases and trims a string', () => {
        expect(normalizeEmail('  User@Example.COM \n')).toBe('user@example.com');
    });

    it('leaves an already normal address alone', () => {
        expect(normalizeEmail('user@example.com')).toBe('user@example.com');
    });

    it('returns anything that is not a string untouched, so the format check can reject it', () => {
        const list = ['user@example.com'];
        expect(normalizeEmail(undefined)).toBeUndefined();
        expect(normalizeEmail(null)).toBeNull();
        expect(normalizeEmail(42)).toBe(42);
        expect(normalizeEmail(list)).toBe(list);
    });
});
