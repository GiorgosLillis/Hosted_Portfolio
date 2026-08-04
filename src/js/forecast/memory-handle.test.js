// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../common/getcookie.js', () => ({
    checkAuth: vi.fn(),
}));

vi.mock('../common/recaptcha.js', () => ({
    loadRecaptchaScript: vi.fn(),
    getRecaptchaToken: vi.fn().mockResolvedValue('fake-recaptcha-token'),
}));

vi.mock('../common/toast.js', () => ({
    showToast: vi.fn(),
}));

// Node's own global `localStorage` shadows jsdom's implementation and doesn't fully
// implement it (no removeItem/clear) - replace with a minimal in-memory polyfill
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

const { checkAuth } = await import('../common/getcookie.js');
const { getRecaptchaToken } = await import('../common/recaptcha.js');
const { showToast } = await import('../common/toast.js');
const { saveCityList, loadCityList } = await import('./memory-handle.js');

const fakeUser = { id: 1 };
const cityList = [{ name: 'Athens', country: 'GR', latitude: 37.98, longitude: 23.72 }];

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    getRecaptchaToken.mockResolvedValue('fake-recaptcha-token');
});

describe('saveCityList', () => {
    it('saves to the local-only store and never calls the server when not authenticated', async () => {
        checkAuth.mockResolvedValue(null);

        const result = await saveCityList(cityList);

        expect(result).toEqual({ success: true });
        expect(global.fetch).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem('localFavoriteLocations'))).toEqual(cityList);
        expect(localStorage.getItem('accountFavoriteLocations')).toBeNull();
    });

    it('posts the list and removed identifiers, and syncs the account cache on success', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        global.fetch.mockResolvedValue({ ok: true });

        const removed = [{ name: 'Paris', country: 'FR' }];
        const result = await saveCityList(cityList, removed);

        expect(result).toEqual({ success: true });
        expect(global.fetch).toHaveBeenCalledWith('/api/cities', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ list: cityList, removed }),
        }));
    });

    it('does not touch the account cache when the server rejects the save', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        global.fetch.mockResolvedValue({ ok: false });

        const result = await saveCityList(cityList);

        expect(result).toEqual({ success: false });
        expect(localStorage.getItem('accountFavoriteLocations')).toBeNull();
        expect(showToast).toHaveBeenCalledWith(expect.any(String), 'danger');
    });

    it('returns failure and does not throw when getRecaptchaToken rejects', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        getRecaptchaToken.mockRejectedValue(new Error('reCAPTCHA not loaded'));

        const result = await saveCityList(cityList);

        expect(result).toEqual({ success: false });
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('loadCityList', () => {
    it('reads from the local-only store when not authenticated', async () => {
        checkAuth.mockResolvedValue(null);
        localStorage.setItem('localFavoriteLocations', JSON.stringify(cityList));

        const result = await loadCityList();

        expect(result).toEqual(cityList);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns an empty array when not authenticated and nothing is cached locally', async () => {
        checkAuth.mockResolvedValue(null);

        const result = await loadCityList();

        expect(result).toEqual([]);
    });

    it('fetches from the server and caches the result under the account key when authenticated', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        global.fetch.mockResolvedValue({ ok: true, json: async () => ({ list: cityList }) });

        const result = await loadCityList();

        expect(result).toEqual(cityList);
        expect(JSON.parse(localStorage.getItem('accountFavoriteLocations'))).toEqual(cityList);
    });

    it('falls back to the cached account list when the server request fails', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        localStorage.setItem('accountFavoriteLocations', JSON.stringify(cityList));
        global.fetch.mockResolvedValue({ ok: false });

        const result = await loadCityList();

        expect(result).toEqual(cityList);
    });

    it('never falls back to the local-only store when authenticated', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        localStorage.setItem('localFavoriteLocations', JSON.stringify([{ name: 'Stale', country: 'XX' }]));
        global.fetch.mockResolvedValue({ ok: false });

        const result = await loadCityList();

        expect(result).toEqual([]);
    });
});
