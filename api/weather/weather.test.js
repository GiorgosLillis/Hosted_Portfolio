import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockReq, createMockRes } from '../testUtils/mockReqRes.js';

vi.mock('../lib/functions.js', () => ({
    setCorsHeaders: vi.fn(),
    getClientIp: vi.fn((req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress),
    handleApiError: vi.fn((res, error, context) => {
        console.error(context, error);
        return res.status(500).json({ success: false, message: 'An unexpected error occurred' });
    }),
    fetchWithTimeout: vi.fn((url, timeoutMs, options) => global.fetch(url, options)),
}));

vi.mock('../lib/rateLimiter.js', () => ({
    rateLimiter: vi.fn().mockResolvedValue({ allowed: true, ttl: 0 }),
}));

vi.mock('../lib/recaptcha.js', () => ({
    recaptchaMiddleware: (req, res, next) => next(),
}));

vi.mock('../lib/prisma.js', () => ({
    prisma: {
        pushSubscription: {
            upsert: vi.fn(),
            deleteMany: vi.fn(),
            findMany: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

vi.mock('web-push', () => ({
    default: {
        setVapidDetails: vi.fn(),
        sendNotification: vi.fn(),
    },
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
const { prisma } = await import('../lib/prisma.js');
const webpush = (await import('web-push')).default;
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

const validSubscription = {
    endpoint: 'https://push.example.com/some-id',
    keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
};

beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.mockResolvedValue({ allowed: true, ttl: 0 });
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');
    stubFetchSuccess();
    prisma.pushSubscription.upsert.mockResolvedValue({});
    prisma.pushSubscription.deleteMany.mockResolvedValue({});
    prisma.pushSubscription.findMany.mockResolvedValue([]);
    prisma.pushSubscription.delete.mockResolvedValue({});
    webpush.sendNotification.mockResolvedValue({});
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

describe('weather vapid-key', () => {
    it('rejects when rate limited with 429', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 5 });
        const req = createMockReq({ method: 'GET', query: { action: 'vapid-key' } });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('returns the configured public key', async () => {
        const req = createMockReq({ method: 'GET', query: { action: 'vapid-key' } });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true, publicKey: 'test-vapid-public-key' });
    });

    it('returns 500 when the key is not configured on the server', async () => {
        const original = process.env.VAPID_PUBLIC_KEY;
        delete process.env.VAPID_PUBLIC_KEY;
        const req = createMockReq({ method: 'GET', query: { action: 'vapid-key' } });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
        process.env.VAPID_PUBLIC_KEY = original;
    });
});

describe('weather subscribe', () => {
    it('rejects a non-POST request with 405', async () => {
        const req = createMockReq({ method: 'GET', query: { action: 'subscribe' } });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('rejects when rate limited with 429', async () => {
        rateLimiter.mockResolvedValueOnce({ allowed: false, ttl: 30 });
        const req = createMockReq({
            query: { action: 'subscribe' },
            body: { subscription: validSubscription, latitude: 37.9, longitude: 23.7 },
        });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('rejects a missing or malformed subscription with 400', async () => {
        const req = createMockReq({
            query: { action: 'subscribe' },
            body: { subscription: { endpoint: 'not-https' }, latitude: 37.9, longitude: 23.7 },
        });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects a subscription missing encryption keys with 400', async () => {
        const req = createMockReq({
            query: { action: 'subscribe' },
            body: { subscription: { endpoint: validSubscription.endpoint }, latitude: 37.9, longitude: 23.7 },
        });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects an invalid latitude with 400', async () => {
        const req = createMockReq({
            query: { action: 'subscribe' },
            body: { subscription: validSubscription, latitude: 999, longitude: 23.7 },
        });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects an invalid longitude with 400', async () => {
        const req = createMockReq({
            query: { action: 'subscribe' },
            body: { subscription: validSubscription, latitude: 37.9, longitude: -999 },
        });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('upserts the subscription by endpoint, defaulting notifyHour to 6, and returns 200 on valid input', async () => {
        const req = createMockReq({
            query: { action: 'subscribe' },
            body: { subscription: validSubscription, latitude: 37.9, longitude: 23.7, city: 'Athens', country: 'GR' },
        });
        const res = createMockRes();
        await weatherHandler(req, res);

        expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { endpoint: validSubscription.endpoint },
                update: expect.objectContaining({ latitude: 37.9, longitude: 23.7, city: 'Athens', country: 'GR', notifyHour: 6 }),
                create: expect.objectContaining({ endpoint: validSubscription.endpoint, latitude: 37.9, longitude: 23.7, notifyHour: 6 }),
            })
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('upserts the subscription using a custom notifyHour', async () => {
        const req = createMockReq({
            query: { action: 'subscribe' },
            body: { subscription: validSubscription, latitude: 37.9, longitude: 23.7, notifyHour: 14 },
        });
        const res = createMockRes();
        await weatherHandler(req, res);

        expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                update: expect.objectContaining({ notifyHour: 14 }),
                create: expect.objectContaining({ notifyHour: 14 }),
            })
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('rejects an out-of-range notifyHour with 400', async () => {
        const req = createMockReq({
            query: { action: 'subscribe' },
            body: { subscription: validSubscription, latitude: 37.9, longitude: 23.7, notifyHour: 24 },
        });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 when saving the subscription fails', async () => {
        prisma.pushSubscription.upsert.mockRejectedValue(new Error('DB is down'));
        const req = createMockReq({
            query: { action: 'subscribe' },
            body: { subscription: validSubscription, latitude: 37.9, longitude: 23.7 },
        });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('weather unsubscribe', () => {
    it('rejects a non-POST request with 405', async () => {
        const req = createMockReq({ method: 'GET', query: { action: 'unsubscribe' } });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('rejects a missing endpoint with 400', async () => {
        const req = createMockReq({ query: { action: 'unsubscribe' }, body: {} });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('deletes the subscription by endpoint and returns 200', async () => {
        const req = createMockReq({
            query: { action: 'unsubscribe' },
            body: { endpoint: validSubscription.endpoint },
        });
        const res = createMockRes();
        await weatherHandler(req, res);

        expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { endpoint: validSubscription.endpoint } });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 when deleting the subscription fails', async () => {
        prisma.pushSubscription.deleteMany.mockRejectedValue(new Error('DB is down'));
        const req = createMockReq({
            query: { action: 'unsubscribe' },
            body: { endpoint: validSubscription.endpoint },
        });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('weather notify', () => {
    const dailyForecast = {
        daily: {
            weather_code: [1, 61],
            temperature_2m_max: [22, 18],
            temperature_2m_min: [12, 9],
        },
    };

    function stubForecastSuccess() {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => dailyForecast });
    }

    it('rejects a request with no Authorization header with 401', async () => {
        const req = createMockReq({ method: 'GET', query: { action: 'notify', hour: '6' }, headers: {} });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects a request with the wrong cron secret with 401', async () => {
        const req = createMockReq({
            method: 'GET',
            query: { action: 'notify', hour: '6' },
            headers: { authorization: 'Bearer wrong-secret' },
        });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects a request with a missing or invalid hour with 400', async () => {
        const req = createMockReq({
            method: 'GET',
            query: { action: 'notify' },
            headers: { authorization: 'Bearer test-cron-secret' },
        });
        const res = createMockRes();
        await weatherHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('sends to every subscription regardless of notifyHour when hour=all', async () => {
        stubForecastSuccess();
        prisma.pushSubscription.findMany.mockResolvedValue([
            { id: 1, endpoint: 'https://push.example.com/a', p256dh: 'p1', auth: 'a1', latitude: 37.9, longitude: 23.7, city: 'Athens', notifyHour: 6 },
            { id: 2, endpoint: 'https://push.example.com/b', p256dh: 'p2', auth: 'a2', latitude: 40.7, longitude: -74.0, city: 'New York', notifyHour: 20 },
        ]);
        const req = createMockReq({
            method: 'GET',
            query: { action: 'notify', hour: 'all' },
            headers: { authorization: 'Bearer test-cron-secret' },
        });
        const res = createMockRes();
        await weatherHandler(req, res);

        expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(undefined);
        expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('sends a daily forecast notification only to subscriptions matching the given hour', async () => {
        stubForecastSuccess();
        prisma.pushSubscription.findMany.mockResolvedValue([
            { id: 1, endpoint: validSubscription.endpoint, p256dh: 'p1', auth: 'a1', latitude: 37.9, longitude: 23.7, city: 'Athens', notifyHour: 6 },
        ]);
        const req = createMockReq({
            method: 'GET',
            query: { action: 'notify', hour: '6' },
            headers: { authorization: 'Bearer test-cron-secret' },
        });
        const res = createMockRes();
        await weatherHandler(req, res);

        expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({ where: { notifyHour: 6 } });
        expect(webpush.sendNotification).toHaveBeenCalledWith(
            { endpoint: validSubscription.endpoint, keys: { p256dh: 'p1', auth: 'a1' } },
            JSON.stringify({
                cityName: 'Athens',
                condition: 'Rain: Slight',
                tempMin: 9,
                tempMax: 18,
                icon: '/assets/weather-icons/showers-day.png',
                img: '/assets/weather-images/rain-day.jpg',
            })
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('deletes a subscription when the push service reports it as gone (410)', async () => {
        stubForecastSuccess();
        prisma.pushSubscription.findMany.mockResolvedValue([
            { id: 1, endpoint: validSubscription.endpoint, p256dh: 'p1', auth: 'a1', latitude: 37.9, longitude: 23.7, notifyHour: 6 },
        ]);
        webpush.sendNotification.mockRejectedValue({ statusCode: 410 });
        const req = createMockReq({
            method: 'GET',
            query: { action: 'notify', hour: '6' },
            headers: { authorization: 'Bearer test-cron-secret' },
        });
        const res = createMockRes();
        await weatherHandler(req, res);

        expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('keeps the subscription and counts a failure for a non-410/404 send error', async () => {
        stubForecastSuccess();
        prisma.pushSubscription.findMany.mockResolvedValue([
            { id: 1, endpoint: validSubscription.endpoint, p256dh: 'p1', auth: 'a1', latitude: 37.9, longitude: 23.7, notifyHour: 6 },
        ]);
        webpush.sendNotification.mockRejectedValue(new Error('push service unreachable'));
        const req = createMockReq({
            method: 'GET',
            query: { action: 'notify', hour: '6' },
            headers: { authorization: 'Bearer test-cron-secret' },
        });
        const res = createMockRes();
        await weatherHandler(req, res);

        expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('1 failed') })
        );
    });
});
