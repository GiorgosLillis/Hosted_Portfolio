import { prisma } from '../lib/prisma.js';
import { checkToken, setCorsHeaders, getClientIp, sendStatus } from '../lib/functions.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// GET to get cities list, POST to create said list
async function citiesHandler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const user = await checkToken(req);
    if (!user) {
      return sendStatus(res, 401, 'not-authenticated', 'Not authenticated');
    }

    const ip = getClientIp(req);

    if (req.method === 'GET') {
      const ipCheck = await rateLimiter(`cities_get_attempt_ip:${ip}`, 120, 60); // 120 requests per minute per IP   
      const userKey = `cities_get_attempt:${user.id}`;
      const { allowed, ttl } = await rateLimiter(userKey, 60, 60); // 60 requests per minute per user

      if (!ipCheck.allowed) {
        res.setHeader('Retry-After', ipCheck.ttl);
        return sendStatus(res, 429, 'rate-limited', `Too many requests. Please try again in ${ipCheck.ttl} seconds.`, { ttl: ipCheck.ttl });
      }
      if (!allowed) {
        res.setHeader('Retry-After', ttl);
        return sendStatus(res, 429, 'rate-limited', `Too many requests. Please try again in ${ttl} seconds.`, { ttl: ttl });
      }

      await GET(res, user);
    } else if (req.method === 'POST') {

      const ipCheck = await rateLimiter(`cities_post_attempt_ip:${ip}`, 40, 60); // 40 requests per minute per IP
      if (!ipCheck.allowed) {
        res.setHeader('Retry-After', ipCheck.ttl);
        return sendStatus(res, 429, 'rate-limited', `Too many requests. Please try again in ${ipCheck.ttl} seconds.`, { ttl: ipCheck.ttl });
      }
      // Rate limiting keyed on user id
      const userKey = `cities_post_attempt:${user.id}`;
      const { allowed, ttl } = await rateLimiter(userKey, 20, 60); // 20 requests per minute

      if (!allowed) {
        res.setHeader('Retry-After', ttl);
        return sendStatus(res, 429, 'rate-limited', `Too many requests. Please try again in ${ttl} seconds.`, { ttl: ttl });
      }
      await POST(req, res, user);
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    if ((error as { message?: string }).message === 'Invalid or expired token.' || (error as { message?: string }).message === 'Not authenticated') {
      return sendStatus(res, 401, 'not-authenticated', 'Not authenticated');
    }
    console.error('Server error in list API:', error);
    return sendStatus(res, 500, 'server-error', 'An unexpected error occurred', { error: process.env.NODE_ENV === 'development' ? (error as { message?: string }).message : undefined });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    return recaptchaMiddleware(req, res, () => citiesHandler(req, res));
  } else {
    return citiesHandler(req, res);
  }
}

async function GET(res: VercelResponse, user: any) {

  // search by user id and return all cities
  try {
    const citiesList = await prisma.city.findMany({
      where: {
        userId: user.id
      },
      select: {
        id: true,
        name: true,
        country: true,
        latitude: true,
        longitude: true
      }
    });

    return sendStatus(res, 200, 'cities-fetched', 'City list fetched successfully', { list: citiesList });

  } catch (error) {
    console.error('Failed to retrieve list:', error);
    return sendStatus(res, 500, 'cities-fetch-failed', 'Failed to fetch city list');
  }
}

async function POST(req: VercelRequest, res: VercelResponse, user: any) {

  const list = req.body.list;
  const removed = req.body.removed || [];
  // Check if the list exists and if the fields are in valid format
  if (!list || !Array.isArray(list)) {
    return sendStatus(res, 400, 'invalid-body-array', 'Invalid request body. Expected an array of items.');
  }

  if (!Array.isArray(removed)) {
    return sendStatus(res, 400, 'invalid-removed', 'Invalid request body. Expected an array of removed items.');
  }

  for (const city of list) {
    if (typeof city !== 'object' || city === null) {
      return sendStatus(res, 400, 'city-invalid', 'Each item in the list must be a valid city object.');
    }
    if (typeof city.name !== 'string' || city.name.trim() === '') {
      return sendStatus(res, 400, 'city-name-required', 'City name is required and must be a non-empty string.');
    }
    if (typeof city.country !== 'string' || city.country.trim() === '') {
      return sendStatus(res, 400, 'city-country-required', 'City country is required and must be a non-empty string.');
    }
    const latitude = parseFloat(city.latitude);
    const longitude = parseFloat(city.longitude);
    if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
      return sendStatus(res, 400, 'invalid-latitude', 'City latitude is required and must be a number between -90 and 90.');
    }
    if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
      return sendStatus(res, 400, 'invalid-longitude', 'City longitude is required and must be a number between -180 and 180.');
    }
  }

  for (const city of removed) {
    if (typeof city !== 'object' || city === null || typeof city.name !== 'string' || typeof city.country !== 'string') {
      return sendStatus(res, 400, 'removed-invalid', 'Each removed entry must include a name and country.');
    }
  }

  try {
    // Delete cities the client explicitly removed
    if (removed.length > 0) {
      await prisma.city.deleteMany({
        where: {
          userId: user.id,
          OR: removed.map(city => ({
            name: city.name,
            country: city.country
          }))
        },
      });
    }

    // Store the cities
    const upsertPromises = list.map(city => {
      return prisma.city.upsert({
        where: {
          name_country_userId: {
            name: city.name,
            country: city.country,
            userId: user.id
          }
        },
        update: {
          latitude: city.latitude,
          longitude: city.longitude
        },
        create: {
          userId: user.id,
          name: city.name,
          country: city.country,
          latitude: city.latitude,
          longitude: city.longitude
        },
      });
    });

    await Promise.all(upsertPromises);

    return sendStatus(res, 200, 'cities-updated', 'City list updated successfully.');

  } catch (error) {
    console.error('Batch Update Failed:', error);
    return sendStatus(res, 500, 'cities-update-failed', 'Failed to update city list.', { error: process.env.NODE_ENV === 'development' ? (error as { message?: string }).message : undefined });
  }
}