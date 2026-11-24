// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../common/fetchWithTimeout.js', () => ({
    fetchWithTimeout: vi.fn(),
}));

// Node's global localStorage shadows jsdom's and is missing removeItem/clear - replace it
function createMemoryStorage() {
    let store = {};
    return {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; },
    };
}

Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
});

const { fetchWithTimeout } = await import('../common/fetchWithTimeout.js');
const i18next = (await import('../common/i18n.js')).default;
const { localName, translatePlaces, translateNow, PLACE_NAMES_EVENT } = await import('./place-names.js');

const tripoli = { city: 'Tripoli', country: 'Greece', latitude: 37.5103, longitude: 22.3724 };
const elefsina = { name: 'Elefsina', country: 'Greece', latitude: '38.0400', longitude: '23.5400' };
const TRIPOLI_KEY = '37.51,22.37';

const greekTripoli = { city: 'Τρίπολη', country: 'Ελλάδα' };

function respondWith(city, country_name) {
    fetchWithTimeout.mockResolvedValue({ ok: true, json: async () => ({ city, country_name }) });
}

function storeTranslation(key, lang, names) {
    const all = JSON.parse(localStorage.getItem('placeNames') || '{}');
    all[key] = { ...all[key], [lang]: names };
    localStorage.setItem('placeNames', JSON.stringify(all));
}

// i18next changes language on real timers, the paced lookups need the fake clock
async function setLanguage(lang) {
    vi.useRealTimers();
    await i18next.changeLanguage(lang);
    vi.useFakeTimers();
}

beforeEach(async () => {
    localStorage.clear();
    fetchWithTimeout.mockReset();
    await setLanguage('en');
});

afterEach(() => {
    vi.useRealTimers();
});

describe('localName', () => {
    it('returns the stored names in English even when a translation is known', () => {
        storeTranslation(TRIPOLI_KEY, 'el', greekTripoli);
        expect(localName(tripoli)).toEqual({ city: 'Tripoli', country: 'Greece' });
    });

    it('returns the known translation in Greek, for both the city and the name shape', async () => {
        storeTranslation(TRIPOLI_KEY, 'el', greekTripoli);
        storeTranslation('38.04,23.54', 'el', { city: 'Ελευσίνα', country: 'Ελλάδα' });
        await setLanguage('el');

        expect(localName(tripoli)).toEqual(greekTripoli);
        expect(localName(elefsina)).toEqual({ city: 'Ελευσίνα', country: 'Ελλάδα' });
    });

    it('adds the region: stored in English, translated in Greek, and never shown for a place that has none', async () => {
        const withRegion = { ...tripoli, region: 'Peloponnese' };
        storeTranslation(TRIPOLI_KEY, 'el', { ...greekTripoli, region: 'Πελοπόννησος' });

        expect(localName(withRegion)).toEqual({ city: 'Tripoli', country: 'Greece', region: 'Peloponnese' });

        await setLanguage('el');
        expect(localName(withRegion)).toEqual({ ...greekTripoli, region: 'Πελοπόννησος' });
        // The stored translation came from the first match, so it must not leak a region into a place that has no region of its own
        expect(localName(tripoli).region).toBeUndefined();
    });

    it('falls back to the stored names until the translation is known, or without coordinates', async () => {
        await setLanguage('el');

        expect(localName(tripoli)).toEqual({ city: 'Tripoli', country: 'Greece' });
        expect(localName({ name: 'Nowhere', country: 'Land' })).toEqual({ city: 'Nowhere', country: 'Land' });
    });
});

describe('translatePlaces', () => {
    it('sends the stored region with the lookup and fetches again a translation saved before regions existed', async () => {
        await setLanguage('el');
        storeTranslation(TRIPOLI_KEY, 'el', greekTripoli);
        fetchWithTimeout.mockResolvedValue({ ok: true, json: async () => ({ city: 'Τρίπολη', country_name: 'Ελλάδα', state: 'Πελοπόννησος' }) });

        translatePlaces([{ ...tripoli, region: 'Peloponnese' }]);
        await vi.runAllTimersAsync();

        expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchWithTimeout.mock.calls[0][1].body)).toEqual({ city: 'Tripoli', country: 'Greece', state: 'Peloponnese', lang: 'el' });
        expect(localName({ ...tripoli, region: 'Peloponnese' }).region).toBe('Πελοπόννησος');

        // Now it has a region, so a second call costs nothing
        translatePlaces([{ ...tripoli, region: 'Peloponnese' }]);
        await vi.runAllTimersAsync();
        expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it('looks up a missing translation once per place, stores it and announces it', async () => {
        await setLanguage('el');
        respondWith('Τρίπολη', 'Ελλάδα');
        const announced = vi.fn();
        window.addEventListener(PLACE_NAMES_EVENT, announced);

        // The same place twice (a bit apart, same 2-decimal key) must cost one request
        translatePlaces([tripoli, { ...tripoli, latitude: 37.5104 }]);
        await vi.runAllTimersAsync();
        window.removeEventListener(PLACE_NAMES_EVENT, announced);

        expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
        const [url, options] = fetchWithTimeout.mock.calls[0];
        expect(url).toBe('/api/Forward_Location');
        expect(JSON.parse(options.body)).toEqual({ city: 'Tripoli', country: 'Greece', lang: 'el' });
        expect(localName(tripoli)).toEqual(greekTripoli);
        expect(announced).toHaveBeenCalledTimes(1);
    });

    it('does not ask again for a place that is already translated', async () => {
        storeTranslation(TRIPOLI_KEY, 'el', greekTripoli);
        await setLanguage('el');

        translatePlaces([tripoli]);
        await vi.runAllTimersAsync();

        expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    it('does nothing in English', async () => {
        translatePlaces([tripoli]);
        await vi.runAllTimersAsync();

        expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    it('skips places without coordinates or a name', async () => {
        await setLanguage('el');

        translatePlaces([null, { city: 'Tripoli', country: 'Greece' }, { latitude: 1, longitude: 2 }]);
        await vi.runAllTimersAsync();

        expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    it('stores nothing when the lookup fails, so the stored names keep showing', async () => {
        await setLanguage('el');
        fetchWithTimeout.mockResolvedValue({ ok: false, status: 404 });

        translatePlaces([tripoli]);
        await vi.runAllTimersAsync();

        expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
        expect(localName(tripoli)).toEqual({ city: 'Tripoli', country: 'Greece' });
    });

    it('stops looking up places once the language has changed back', async () => {
        await setLanguage('el');
        respondWith('Τρίπολη', 'Ελλάδα');

        translatePlaces([tripoli, elefsina]);
        await setLanguage('en');
        await vi.runAllTimersAsync();

        expect(fetchWithTimeout).not.toHaveBeenCalled();
    });
});

describe('translateNow', () => {
    it('translates one place right away and announces it', async () => {
        await setLanguage('el');
        respondWith('Τρίπολη', 'Ελλάδα');
        const announced = vi.fn();
        window.addEventListener(PLACE_NAMES_EVENT, announced);

        await translateNow(tripoli);
        window.removeEventListener(PLACE_NAMES_EVENT, announced);

        expect(localName(tripoli)).toEqual(greekTripoli);
        expect(announced).toHaveBeenCalledTimes(1);
    });

    it('makes no request when the place is already translated, has no coordinates, or the language is English', async () => {
        storeTranslation(TRIPOLI_KEY, 'el', greekTripoli);
        await setLanguage('el');
        await translateNow(tripoli);
        await translateNow({ city: 'Tripoli', country: 'Greece' });
        await setLanguage('en');
        await translateNow(elefsina);

        expect(fetchWithTimeout).not.toHaveBeenCalled();
    });
});
