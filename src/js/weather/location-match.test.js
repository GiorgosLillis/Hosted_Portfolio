import { describe, it, expect } from 'vitest';
import { isSameLocation } from './location-match.js';

describe('isSameLocation', () => {
    it('matches the same place by coordinates even when the names are in different languages', () => {
        const english = { name: 'Athens', country: 'Greece', latitude: '37.9838', longitude: '23.7275' };
        const greek = { city: 'Αθήνα', country: 'Ελλάδα', latitude: 37.9838, longitude: 23.7275 };
        expect(isSameLocation(english, greek)).toBe(true);
    });

    it('does not match places that are far apart, even with the same name', () => {
        const a = { city: 'Paris', country: 'France', latitude: 48.85, longitude: 2.35 };
        const b = { city: 'Paris', country: 'United States', latitude: 33.66, longitude: -95.55 };
        expect(isSameLocation(a, b)).toBe(false);
    });

    it('falls back to a case-insensitive name and country match when coordinates are missing', () => {
        expect(isSameLocation({ name: 'athens', country: 'greece' }, { city: 'Athens', country: 'Greece' })).toBe(true);
        expect(isSameLocation({ name: 'Athens', country: 'Greece' }, { city: 'Sparta', country: 'Greece' })).toBe(false);
    });

    it('returns false when either side is missing', () => {
        expect(isSameLocation(null, { city: 'Athens', country: 'Greece' })).toBe(false);
        expect(isSameLocation({ city: 'Athens', country: 'Greece' }, undefined)).toBe(false);
    });
});
