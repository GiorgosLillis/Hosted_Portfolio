import { setCorsHeaders, getClientIp, handleApiError, fetchWithTimeout } from '../lib/functions.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import { prisma } from '../lib/prisma.js';
import { Redis } from '@upstash/redis';
import webpush from 'web-push';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const redis = Redis.fromEnv();

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}

interface WeatherCondition {
    condition: string;
    dayIcon: string;
    nightIcon: string;
    dayImg: string;
    nightImg: string;
}

const PathtoImg = 'assets/weather-images/'
const PathtoIcons = 'assets/weather-icons/';
const weatherCodeMapping: Record<number, WeatherCondition> = {
    0: { condition: 'Clear sky', dayIcon: PathtoIcons + 'clear-day.svg', nightIcon: PathtoIcons + 'clear-night.svg', dayImg: PathtoImg + 'clear-day.jpg', nightImg: PathtoImg + 'clear-night.jpg' },
    1: { condition: 'Mainly clear', dayIcon: PathtoIcons + 'partly-cloudy-day.svg', nightIcon: PathtoIcons + 'partly-cloudy-night.svg', dayImg: PathtoImg + 'clouds-day.jpg', nightImg: PathtoImg + 'clouds-night.jpg' },
    2: { condition: 'Partly cloudy', dayIcon: PathtoIcons + 'partly-cloudy-day.svg', nightIcon: PathtoIcons + 'partly-cloudy-night.svg', dayImg: PathtoImg + 'clouds-day.jpg', nightImg: PathtoImg + 'clouds-night.jpg' },
    3: { condition: 'Overcast', dayIcon: PathtoIcons + 'cloudy.svg', nightIcon: PathtoIcons + 'cloudy.svg', dayImg: PathtoImg + 'overcast.jpg', nightImg: PathtoImg + 'overcast.jpg' },
    45: { condition: 'Fog', dayIcon: PathtoIcons + 'fog.svg', nightIcon: PathtoIcons + 'fog.svg', dayImg: PathtoImg + 'fog.jpg', nightImg: PathtoImg + 'fog.jpg' },
    48: { condition: 'Depositing rime fog', dayIcon: PathtoIcons + 'fog.svg', nightIcon: PathtoIcons + 'fog.svg', dayImg: PathtoImg + 'fog.jpg', nightImg: PathtoImg + 'fog.jpg' },
    51: { condition: 'Drizzle: Light', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'drizzle-day.jpg', nightImg: PathtoImg + 'drizzle-night.jpg' },
    53: { condition: 'Drizzle: Moderate', dayIcon: PathtoIcons + 'howers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'drizzle-day.jpg', nightImg: PathtoImg + 'drizzle-night.jpg' },
    55: { condition: 'Drizzle: Dense', dayIcon: PathtoIcons + 'rain.svg', nightIcon: PathtoIcons + 'rain.svg', dayImg: PathtoImg + 'drizzle-day.jpg', nightImg: PathtoImg + 'drizzle-night.jpg' },
    56: { condition: 'Freezing Drizzle: Light', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg', dayImg: PathtoImg + 'sleet-day.jpg', nightImg: PathtoImg + 'sleet-day.jpg' },
    57: { condition: 'Freezing Drizzle: Dense', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg', dayImg: PathtoImg + 'sleet-night.jpg', nightImg: PathtoImg + 'sleet-night.jpg' },
    61: { condition: 'Rain: Slight', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'rain-day.jpg', nightImg: PathtoImg + 'rain-night.jpg' },
    63: { condition: 'Rain: Moderate', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'rain-day.jpg', nightImg: PathtoImg + 'rain-night.jpg' },
    65: { condition: 'Rain: Heavy', dayIcon: PathtoIcons + 'rain.svg', nightIcon: PathtoIcons + 'rain.svg', dayImg: PathtoImg + 'rain.jpg', nightImg: PathtoImg + 'rain.jpg' },
    66: { condition: 'Freezing Rain: Light', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg', dayImg: PathtoImg + 'sleet-day.jpg', nightImg: PathtoImg + 'sleet-night.jpg' },
    67: { condition: 'Freezing Rain: Heavy', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg', dayImg: PathtoImg + 'sleet-day.jpg', nightImg: PathtoImg + 'sleet-night.jpg' },
    71: { condition: 'Snow fall: Slight', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg', dayImg: PathtoImg + 'snow-day.jpg', nightImg: PathtoImg + 'snow-night.jpg' },
    73: { condition: 'Snow fall: Moderate', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg', dayImg: PathtoImg + 'snow-day.jpg', nightImg: PathtoImg + 'snow-night.jpg' },
    75: { condition: 'Snow fall: Heavy', dayIcon: PathtoIcons + 'snow.svg', nightIcon: PathtoIcons + 'snow.svg', dayImg: PathtoImg + 'heavy-snow.jpg', nightImg: PathtoImg + 'heavy-snow.jpg' },
    77: { condition: 'Snow grains', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg', dayImg: PathtoImg + 'snow-day.jpg', nightImg: PathtoImg + 'snow-night.jpg' },
    80: { condition: 'Rain showers: Slight', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'rain-day.jpg', nightImg: PathtoImg + 'rain-night.jpg' },
    81: { condition: 'Rain showers: Moderate', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'rain-day.jpg', nightImg: PathtoImg + 'rain-night.jpg' },
    82: { condition: 'Rain showers: Violent', dayIcon: PathtoIcons + 'rain.svg', nightIcon: PathtoIcons + 'rain.svg', dayImg: PathtoImg + 'rain.jpg', nightImg: PathtoImg + 'rain.jpg' },
    85: { condition: 'Snow showers: Slight', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg', dayImg: PathtoImg + 'snow-day.jpg', nightImg: PathtoImg + 'snow-night.jpg' },
    86: { condition: 'Snow showers: Heavy', dayIcon: PathtoIcons + 'snow.svg', nightIcon: PathtoIcons + 'snow.svg', dayImg: PathtoImg + 'snow.jpg', nightImg: PathtoImg + 'snow.jpg' },
    95: { condition: 'Thunderstorm: Slight or moderate', dayIcon: PathtoIcons + 'thunder-showers-day.svg', nightIcon: PathtoIcons + 'thunder-showers-night.svg', dayImg: PathtoImg + 'thunder.jpg', nightImg: PathtoImg + 'thunder.jpg' },
    96: { condition: 'Thunderstorm with slight hail', dayIcon: PathtoIcons + 'thunder-rain.svg', nightIcon: PathtoIcons + 'thunder-rain-night.svg', dayImg: PathtoImg + 'thunder.jpg', nightImg: PathtoImg + 'thunder.jpg' },
    99: { condition: 'Thunderstorm with heavy hail', dayIcon: PathtoIcons + 'hail.svg', nightIcon: PathtoIcons + 'hail-night.svg', dayImg: PathtoImg + 'thunder.jpg', nightImg: PathtoImg + 'thunder.jpg' },
};



function getNoonInfo(currentDate: Date, hourlyTimes: string[], hourlyWeatherCodes: number[]): WeatherCondition | null {
    const noonIndex = hourlyTimes.findIndex(hourlyTime => {
        const hourlyDate = new Date(hourlyTime);
        return hourlyDate.getDate() === currentDate.getDate() && hourlyDate.getHours() === 12;
    });

    if (noonIndex !== -1) {
        const noonWeatherCode = hourlyWeatherCodes[noonIndex];
        const dayInfo = weatherCodeMapping[noonWeatherCode];
        return dayInfo || null;
    }
    return null;

}

// Proxies Open-Meteo so the API key-free upstream call happens server-side, with caching at every layer
async function weatherInfo(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // Cache for 1 hour (3600s) at the Edge
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');

    // IP tracking for rate limiting
    const ip = getClientIp(req);
    const { allowed, ttl } = await rateLimiter(ip, 20, 60);
    if (!allowed) {
        return res.status(429).json({
            success: false,
            message: `Too many requests. Please try again in ${ttl} seconds.`
        });
    }

    const { lat, lon } = req.method === 'GET' ? req.query : req.body;

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);

    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
        return res.status(400).json({ success: false, message: "Invalid latitude. Must be a number between -90 and 90." });
    }
    if (isNaN(parsedLon) || parsedLon < -180 || parsedLon > 180) {
        return res.status(400).json({ success: false, message: "Invalid longitude. Must be a number between -180 and 180." });
    }



    // Redis is the real 1-hour cache, if it's down just fetch fresh instead of failing
    const cacheKey = `weather_data:${parsedLat}:${parsedLon}`;
    try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            return res.status(200).json(cachedData);
        }
    } catch (error) {
        console.error('Redis read failed for weather cache, fetching fresh:', error);
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${parsedLat}&longitude=${parsedLon}&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,uv_index,apparent_temperature,is_day&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=7&timezone=auto`;
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${parsedLat}&longitude=${parsedLon}&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide&timezone=auto`;

    try {
        const [res1, res2] = await Promise.all([
            fetchWithTimeout(url),
            fetchWithTimeout(airQualityUrl)
        ]);

        if (!res1.ok) {
            throw new Error(`Failed to fetch weather data: ${res1.status}`);
        }
        if (!res2.ok) {
            throw new Error(`Failed to fetch air quality data: ${res2.status}`);
        }

        const [weatherData, airQualityData] = await Promise.all([
            res1.json(),
            res2.json()
        ]);
        if (!weatherData || !weatherData.hourly || !weatherData.daily) {
            throw new Error('Incomplete weather data received from API');
        }

        // Find the index of the hourly entry closest to the current time
        const now = Date.now();
        const hourlyTimestamps = weatherData.hourly.time.map((ts: any) => new Date(ts).getTime());
        let closestIndex = 0;
        let minDiff = Math.abs(hourlyTimestamps[0] - now);
        for (let i = 1; i < hourlyTimestamps.length; i++) {
            const diff = Math.abs(hourlyTimestamps[i] - now);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
        }

        const hourlyInfo = weatherData.hourly.time.map((timestamp: any, index: number) => {
            const hasAirQualityData = index < 120;
            const code = weatherData.hourly.weather_code[index];
            const condition = weatherCodeMapping[code];
            const isDay = weatherData.hourly.is_day[index];

            return {
                timestamp,
                time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                day: new Date(timestamp).toLocaleDateString(),
                temp: weatherData.hourly.temperature_2m[index],
                apparentTemperature: weatherData.hourly.apparent_temperature[index],
                humidity: weatherData.hourly.relative_humidity_2m[index],
                windDirection: weatherData.hourly.wind_direction_10m[index],
                windSpeed: weatherData.hourly.wind_speed_10m[index],
                uvIndex: weatherData.hourly.uv_index[index],
                isDay: isDay,
                condition: condition.condition,
                airQuality: hasAirQualityData ? {
                    pm10: airQualityData.hourly.pm10[index],
                    pm2_5: airQualityData.hourly.pm2_5[index],
                    carbonMonoxide: airQualityData.hourly.carbon_monoxide[index],
                    nitrogenDioxide: airQualityData.hourly.nitrogen_dioxide[index],
                    ozone: airQualityData.hourly.ozone[index],
                    sulphurDioxide: airQualityData.hourly.sulphur_dioxide[index],
                } : null,
                icon: isDay ? condition.dayIcon : condition.nightIcon
            };
        });

        const dailyInfo = weatherData.daily.time.map((date: any, index: number) => {
            const currentDate = new Date(date);
            const noonInfo = getNoonInfo(currentDate, weatherData.hourly.time, weatherData.hourly.weather_code);
            const noonCondition = noonInfo ? noonInfo.condition : 'Unknown';
            const noonIcon = noonInfo ? noonInfo.dayIcon : PathtoIcons + 'unknown.svg';

            return {
                index,
                date,
                condition: noonCondition,
                icon: noonIcon,
                tempMax: weatherData.daily.temperature_2m_max[index],
                tempMin: weatherData.daily.temperature_2m_min[index],
                sunrise: weatherData.daily.sunrise[index],
                sunset: weatherData.daily.sunset[index]
            }
        });

        // Use the index for current weather
        const isDayCurrent = hourlyInfo[closestIndex].isDay;
        const currentCode = weatherData.hourly.weather_code[closestIndex];
        const currentCondition = weatherCodeMapping[currentCode];
        const airQuality = {
            pm10: airQualityData.hourly.pm10[closestIndex],
            pm2_5: airQualityData.hourly.pm2_5[closestIndex],
            carbonMonoxide: airQualityData.hourly.carbon_monoxide[closestIndex],
            nitrogenDioxide: airQualityData.hourly.nitrogen_dioxide[closestIndex],
            ozone: airQualityData.hourly.ozone[closestIndex],
            sulphurDioxide: airQualityData.hourly.sulphur_dioxide[closestIndex],
        };

        const weatherInfo = {
            current: {
                temperature: weatherData.hourly.temperature_2m[closestIndex],
                apparentTemperature: weatherData.hourly.apparent_temperature[closestIndex],
                condition: currentCondition.condition,
                timestamp: weatherData.hourly.time[closestIndex],
                icon: isDayCurrent ? currentCondition.dayIcon : currentCondition.nightIcon,
                img: isDayCurrent ? currentCondition.dayImg : currentCondition.nightImg,
                windSpeed: weatherData.hourly.wind_speed_10m[closestIndex],
                humidity: weatherData.hourly.relative_humidity_2m[closestIndex],
                uvIndex: weatherData.hourly.uv_index[closestIndex],
                isDay: isDayCurrent,
                airQuality: airQuality,
            },
            hourly: hourlyInfo,

            daily: dailyInfo,
        };

        try {
            await redis.set(cacheKey, weatherInfo, { ex: 3600 }); //cache for 1 hour
        } catch (error) {
            console.error('Redis write failed for weather cache:', error);
        }

        res.status(200).json(weatherInfo);
    } catch (error) {
        return handleApiError(res, error, 'Error fetching weather data:');
    }
};

const isValidLatitude = (lat: number) => !isNaN(lat) && lat >= -90 && lat <= 90;
const isValidLongitude = (lon: number) => !isNaN(lon) && lon >= -180 && lon <= 180;

// The VAPID public key isn't secret (it's embedded in every subscriber's browser by design),
// but it's served from here rather than duplicated into a separate frontend-build env var
async function getVapidKey(req: VercelRequest, res: VercelResponse) {
    const ip = getClientIp(req);
    const { allowed, ttl } = await rateLimiter(`vapid_key_attempt_ip:${ip}`, 30, 60);
    if (!allowed) {
        res.setHeader('Retry-After', ttl);
        return res.status(429).json({ success: false, message: `Too many requests. Please try again in ${ttl} seconds.` });
    }

    if (!process.env.VAPID_PUBLIC_KEY) {
        console.error('VAPID_PUBLIC_KEY is not configured on the server');
        return res.status(500).json({ success: false, message: 'Push notifications are not configured on the server.' });
    }

    return res.status(200).json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
}

// Anonymous, no login required: stores a browser push subscription tied to a location for the daily forecast
async function subscribe(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Only POST requests are allowed' });
    }

    const ip = getClientIp(req);
    const { allowed, ttl } = await rateLimiter(`push_subscribe_attempt_ip:${ip}`, 10, 3600); // 10 per hour per IP
    if (!allowed) {
        res.setHeader('Retry-After', ttl);
        return res.status(429).json({ success: false, message: `Too many requests. Please try again in ${ttl} seconds.` });
    }

    const { subscription, latitude, longitude, city, country, notifyHour } = req.body;

    if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.endpoint.startsWith('https://')) {
        return res.status(400).json({ success: false, message: 'A valid push subscription is required.' });
    }
    if (!subscription.keys || typeof subscription.keys.p256dh !== 'string' || typeof subscription.keys.auth !== 'string') {
        return res.status(400).json({ success: false, message: 'Push subscription is missing encryption keys.' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    if (!isValidLatitude(lat)) {
        return res.status(400).json({ success: false, message: 'Invalid latitude. Must be a number between -90 and 90.' });
    }
    if (!isValidLongitude(lon)) {
        return res.status(400).json({ success: false, message: 'Invalid longitude. Must be a number between -180 and 180.' });
    }

    const hour = notifyHour === undefined ? 6 : parseInt(notifyHour, 10);
    if (isNaN(hour) || hour < 0 || hour > 23) {
        return res.status(400).json({ success: false, message: 'notifyHour must be an integer between 0 and 23.' });
    }

    try {
        await prisma.pushSubscription.upsert({
            where: { endpoint: subscription.endpoint },
            update: {
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                latitude: lat,
                longitude: lon,
                city: city || null,
                country: country || null,
                notifyHour: hour
            },
            create: {
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                latitude: lat,
                longitude: lon,
                city: city || null,
                country: country || null,
                notifyHour: hour
            }
        });

        return res.status(200).json({ success: true, message: 'Subscribed to daily weather alerts.' });
    } catch (error) {
        return handleApiError(res, error, 'Server error in weather subscribe:');
    }
}

// Idempotent by design: removing a subscription that no longer exists is a no-op, not an error
async function unsubscribe(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Only POST requests are allowed' });
    }

    const ip = getClientIp(req);
    const { allowed, ttl } = await rateLimiter(`push_unsubscribe_attempt_ip:${ip}`, 20, 3600);
    if (!allowed) {
        res.setHeader('Retry-After', ttl);
        return res.status(429).json({ success: false, message: `Too many requests. Please try again in ${ttl} seconds.` });
    }

    const { endpoint } = req.body;
    if (typeof endpoint !== 'string' || !endpoint) {
        return res.status(400).json({ success: false, message: 'An endpoint is required.' });
    }

    try {
        await prisma.pushSubscription.deleteMany({ where: { endpoint } });
        return res.status(200).json({ success: true, message: 'Unsubscribed from weather alerts.' });
    } catch (error) {
        return handleApiError(res, error, 'Server error in weather unsubscribe:');
    }
}

// Cron-only: Vercel sends "Authorization: Bearer <CRON_SECRET>" on cron-triggered requests, nobody else knows the secret.
// One of 24 cron entries in vercel.json hits this every hour, each passing its own UTC hour so only that hour's subscribers get sent to.
async function notify(req: VercelRequest, res: VercelResponse) {
    if (!process.env.CRON_SECRET || req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    // hour=all is a manual-testing escape hatch (still gated by CRON_SECRET) so you don't have to match
    // a real subscription's stored notifyHour to trigger a send - no cron ever passes this value.
    const hourParam = req.query.hour as string;
    const sendToAll = hourParam === 'all';
    let hour: number | undefined;
    if (!sendToAll) {
        hour = parseInt(hourParam, 10);
        if (isNaN(hour) || hour < 0 || hour > 23) {
            return res.status(400).json({ success: false, message: 'A valid hour (0-23), or "all" for testing, is required.' });
        }
    }

    try {
        const subscriptions = await prisma.pushSubscription.findMany(sendToAll ? undefined : { where: { notifyHour: hour } });

        const results = await Promise.allSettled(subscriptions.map(async (sub) => {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${sub.latitude}&longitude=${sub.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto`;
            const response = await fetchWithTimeout(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch forecast: ${response.status}`);
            }
            const data = await response.json();

            const tomorrowCode = data.daily.weather_code[1];
            const tomorrowMax = data.daily.temperature_2m_max[1];
            const tomorrowMin = data.daily.temperature_2m_min[1];
            const tomorrowWeather = weatherCodeMapping[tomorrowCode];
            const condition = tomorrowWeather?.condition || 'Unknown conditions';
            const cityName = sub.city || 'your area';

            // The push service (and eventually the notification popup) needs absolute paths, and only .png works as a notification icon
            const formatPath = (path?: string) => (path ? (path.startsWith('/') ? path : `/${path}`) : '');
            const iconUrl = formatPath(tomorrowWeather?.dayIcon).replace('.svg', '.png');
            const imgUrl = formatPath(tomorrowWeather?.dayImg);

            const payload = JSON.stringify({
                cityName,
                condition,
                tempMin: Math.round(tomorrowMin),
                tempMax: Math.round(tomorrowMax),
                icon: iconUrl,
                img: imgUrl,
            });

            try {
                await webpush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth }
                }, payload);
            } catch (error) {
                const statusCode = (error as { statusCode?: number }).statusCode;
                if (statusCode === 404 || statusCode === 410) {
                    // Push service says this subscription is dead (browser data cleared, uninstalled, etc.)
                    await prisma.pushSubscription.delete({ where: { id: sub.id } });
                } else {
                    throw error;
                }
            }
        }));

        const failed = results.filter(r => r.status === 'rejected').length;
        return res.status(200).json({
            success: true,
            message: `Processed ${subscriptions.length} subscriptions, ${failed} failed.`
        });
    } catch (error) {
        return handleApiError(res, error, 'Server error in weather notify:');
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const { action } = req.query;

    if (action === 'vapid-key') {
        return getVapidKey(req, res);
    } else if (action === 'subscribe') {
        return recaptchaMiddleware(req, res, () => subscribe(req, res));
    } else if (action === 'unsubscribe') {
        return unsubscribe(req, res);
    } else if (action === 'notify') {
        return notify(req, res);
    } else {
        return weatherInfo(req, res);
    }
}
