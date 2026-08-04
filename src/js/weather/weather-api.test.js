// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLocation, getCityLocation, fetchWeather, getCachedWeather, isWeatherDataFresh } from './weather-api.js';

const geoMock = vi.fn();

Object.defineProperty(window.navigator, 'geolocation', {
    value: { getCurrentPosition: geoMock },
    configurable: true,
});

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

beforeEach(() => {
    localStorage.removeItem('LocationInfo');
    localStorage.removeItem('CityInfo');
    localStorage.removeItem('WeatherInfo');
    geoMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
});

describe('getLocation', () => {
    it('returns the cached location when it is less than 24 hours old', async () => {
        const cached = { city: 'Athens', country: 'Greece', timestamp: Date.now() };
        localStorage.setItem('LocationInfo', JSON.stringify(cached));

        const result = await getLocation();

        expect(result).toEqual(cached);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fetches fresh data via geolocation + reverse geocoding when there is no cache', async () => {
        geoMock.mockImplementation((resolve) => resolve({ coords: { latitude: 37.98, longitude: 23.72 } }));
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ country_name: 'Greece', country: 'GR', city: 'Athens' }),
        });

        const result = await getLocation();

        expect(global.fetch).toHaveBeenCalledWith('/api/Reverse_Location', expect.objectContaining({ method: 'POST' }));
        expect(result.city).toBe('Athens');
        expect(result.latitude).toBe(37.98);
        expect(JSON.parse(localStorage.getItem('LocationInfo')).city).toBe('Athens');
    });

    it('throws a friendly message when the user denies geolocation permission', async () => {
        geoMock.mockImplementation((resolve, reject) =>
            reject({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
        );

        await expect(getLocation()).rejects.toThrow(/denied the request for Geolocation/);
    });

    it('throws a friendly message when geolocation times out', async () => {
        geoMock.mockImplementation((resolve, reject) =>
            reject({ code: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
        );

        await expect(getLocation()).rejects.toThrow(/timed out/);
    });
});

describe('getCityLocation (forward geocoding)', () => {
    it('resolves a city/country search and caches the result', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ latitude: 1.1, longitude: 2.2, country_name: 'Greece', country: 'GR', city: 'Athens' }),
        });

        const result = await getCityLocation('Athens', 'GR');

        expect(global.fetch).toHaveBeenCalledWith('/api/Forward_Location', expect.objectContaining({ method: 'POST' }));
        expect(result.latitude).toBe(1.1);
        expect(JSON.parse(localStorage.getItem('CityInfo')).city).toBe('Athens');
    });

    it('throws a "not found" error on a 404 response', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 404 });
        await expect(getCityLocation('Nowhere', 'XX')).rejects.toThrow(/City not found/);
    });

    it('returns the cached city when it matches and is fresh', async () => {
        const cached = { city: 'Athens', country: 'GR', timestamp: Date.now() };
        localStorage.setItem('CityInfo', JSON.stringify(cached));

        const result = await getCityLocation('Athens', 'GR');

        expect(result).toEqual(cached);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('fetchWeather', () => {
    const locationInfo = { latitude: 37.98, longitude: 23.72, city: 'Athens', country: 'Greece' };

    it('fetches weather data, caches it, and returns it on success', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ current: { temperature: 20 }, hourly: {}, daily: {} }),
        });

        const result = await fetchWeather(locationInfo);

        expect(result.current.temperature).toBe(20);
        expect(result.city).toBe('Athens');
        expect(JSON.parse(localStorage.getItem('WeatherInfo')).city).toBe('Athens');
    });

    it('throws when the response is not ok', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 500 });
        await expect(fetchWeather(locationInfo)).rejects.toThrow();
    });
});

describe('getCachedWeather / isWeatherDataFresh', () => {
    it('returns null when there is no cached weather', () => {
        expect(getCachedWeather({ city: 'Athens', country: 'Greece' })).toBeNull();
    });

    it('returns the cached weather when fresh and the city matches', () => {
        const cached = { city: 'Athens', country: 'Greece', time: Date.now(), current: {} };
        localStorage.setItem('WeatherInfo', JSON.stringify(cached));

        expect(isWeatherDataFresh()).toBe(true);
        expect(getCachedWeather({ city: 'Athens', country: 'Greece' })).toEqual(cached);
    });

    it('returns null when the cached weather is for a different city', () => {
        const cached = { city: 'Athens', country: 'Greece', time: Date.now(), current: {} };
        localStorage.setItem('WeatherInfo', JSON.stringify(cached));

        expect(getCachedWeather({ city: 'Thessaloniki', country: 'Greece' })).toBeNull();
    });

    it('reports stale weather data as not fresh', () => {
        const staleTime = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
        localStorage.setItem('WeatherInfo', JSON.stringify({ city: 'Athens', country: 'Greece', time: staleTime }));

        expect(isWeatherDataFresh()).toBe(false);
    });
});
