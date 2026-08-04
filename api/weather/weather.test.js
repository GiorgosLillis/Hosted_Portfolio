import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';

vi.mock('../lib/functions.js', () => ({
    setCorsHeaders: vi.fn(),
    getClientIp: vi.fn((req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress),
}));

vi.mock('../lib/rateLimiter.js', () => ({
    rateLimiter: vi.fn().mockResolvedValue({ allowed: true, ttl: 0 }),
}));

vi.mock('@upstash/redis', () => ({
    Redis: {
        fromEnv: vi.fn(() => ({
            get: vi.fn(),
            set: vi.fn(),
        })),
    },
}));

const { Redis } = await import('@upstash/redis');
const { rateLimiter } = await import('../lib/rateLimiter.js');
const weatherHandler = (await import('./weather.js')).default;

const redis = Redis.fromEnv.mock.results[0].value;

const nowIso = new Date().toISOString();
const mockWeatherData = {
    hourly: {
        time: [nowIso],
        temperature_2m: [20],
        apparent_temperature: [19],
        relative_humidity_2m: [50],
        wind_direction_10m: [180],
        wind_speed_10m: [10],
        uv_index: [5],
        is_day: [1],
        weather_code: [0],
    },
    daily: {
        time: [nowIso.split('T')[0]],
        temperature_2m_max: [25],
        temperature_2m_min: [15],
        sunrise: [nowIso],
        sunset: [nowIso],
    },
};
const mockAirQualityData = {
    hourly: {
        pm10: [5],
        pm2_5: [3],
        carbon_monoxide: [100],
        nitrogen_dioxide: [10],
        ozone: [20],
        sulphur_dioxide: [1],
    },
};

function stubFetchSuccess() {
    global.fetch = vi.fn((url) => {
        if (String(url).includes('air-quality')) {
            return Promise.resolve({ ok: true, json: async () => mockAirQualityData });
        }
        return Promise.resolve({ ok: true, json: async () => mockWeatherData });
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');
    stubFetchSuccess();
});

describe('weather handler', () => {
    it('responds to OPTIONS preflight with 204', async () => {
        const req = createMockReq({ method: 'OPTIONS' });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('rejects an invalid latitude with 400', async () => {
        const req = createMockReq({ body: { lat: 999, lon: 23.7 } });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects an invalid longitude with 400', async () => {
        const req = createMockReq({ body: { lat: 37.9, lon: -999 } });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects when rate limited with 429', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 15 });
        const req = createMockReq({ body: { lat: 37.9, lon: 23.7 } });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('returns cached data without calling the upstream API on a cache hit', async () => {
        redis.get.mockResolvedValue({ current: { temperature: 99 } });
        const req = createMockReq({ body: { lat: 37.9, lon: 23.7 } });
        const res = createMockRes();
        await weatherHandler(req, res);

        expect(global.fetch).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ current: { temperature: 99 } });
    });

    it('falls back to a fresh fetch when the cache read fails', async () => {
        redis.get.mockRejectedValue(new Error('Redis is down'));
        const req = createMockReq({ body: { lat: 10.1, lon: 20.1 } });
        const res = createMockRes();
        await weatherHandler(req, res);

        expect(global.fetch).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('fetches fresh data, caches it, and returns 200 on a cache miss', async () => {
        const req = createMockReq({ body: { lat: 10.2, lon: 20.2 } });
        const res = createMockRes();
        await weatherHandler(req, res);

        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(redis.set).toHaveBeenCalledWith(
            expect.stringContaining('weather_data:'),
            expect.any(Object),
            { ex: 3600 }
        );
        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(payload.current.temperature).toBe(20);
    });

    it('still returns 200 when caching the fresh result fails', async () => {
        redis.set.mockRejectedValue(new Error('Redis is down'));
        const req = createMockReq({ body: { lat: 10.3, lon: 20.3 } });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 when the upstream weather API fails', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 502 });
        const req = createMockReq({ body: { lat: 10.4, lon: 20.4 } });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
