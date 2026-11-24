import { prisma } from '../lib/prisma.js';
import { checkToken, setCorsHeaders, getClientIp, sendStatus } from '../lib/functions.js';
import { enforceRateLimits } from '../lib/http.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Limits the browser already respects, enforced here too because anyone can call the API directly
const MAX_CITIES = 100;
const MAX_TEXT_LENGTH = 100;

// Accepts numbers and numeric strings only, so null, an empty string or a boolean can't turn into 0
function toCoordinate(value: unknown): number {
  return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
}

const isValidLatitude = (value: number) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLongitude = (value: number) => Number.isFinite(value) && value >= -180 && value <= 180;

// GET to get cities list, POST to create said list
async function citiesHandler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const user = await checkToken(req);

    const ip = getClientIp(req);

    if (req.method === 'GET') {
      if (!(await enforceRateLimits(res,
        [`cities_get_attempt_ip:${ip}`, 120, 60], // 120 requests per minute per IP
        [`cities_get_attempt:${user.id}`, 60, 60] // 60 requests per minute per user
      ))) return;
      await GET(res, user);
    } else if (req.method === 'POST') {
      if (!(await enforceRateLimits(res,
        [`cities_post_attempt_ip:${ip}`, 40, 60],  // 40 requests per minute per IP
        [`cities_post_attempt:${user.id}`, 20, 60] // 20 requests per minute per user
      ))) return;
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
        region: true,
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

// The saved list replaces the stored one: whatever is in it is added or updated, every other city of the user is deleted
async function POST(req: VercelRequest, res: VercelResponse, user: any) {

  const list = req.body.list;
  if (!list || !Array.isArray(list)) {
    return sendStatus(res, 400, 'invalid-body-array', 'Invalid request body. Expected an array of items.');
  }
  if (list.length > MAX_CITIES) {
    return sendStatus(res, 400, 'list-too-large', 'The list is too large.');
  }

  // The validated, parsed values are what gets stored, never the raw client strings
  const validCities: { name: string; country: string; region: string | null; latitude: number; longitude: number }[] = [];
  for (const city of list) {
    if (typeof city !== 'object' || city === null) {
      return sendStatus(res, 400, 'city-invalid', 'Each item in the list must be a valid city object.');
    }
    if (typeof city.name !== 'string' || city.name.trim() === '') {
      return sendStatus(res, 400, 'city-name-required', 'City name is required and must be a non-empty string.');
    }
    if (city.name.length > MAX_TEXT_LENGTH) {
      return sendStatus(res, 400, 'city-name-long', 'City name is too long.');
    }
    if (typeof city.country !== 'string' || city.country.trim() === '') {
      return sendStatus(res, 400, 'city-country-required', 'City country is required and must be a non-empty string.');
    }
    if (city.country.length > MAX_TEXT_LENGTH) {
      return sendStatus(res, 400, 'country-long', 'Country name is too long.');
    }
    // Optional, an empty one is stored as none
    const hasRegion = city.region !== undefined && city.region !== null && city.region !== '';
    if (hasRegion && (typeof city.region !== 'string' || city.region.length > MAX_TEXT_LENGTH)) {
      return sendStatus(res, 400, 'region-invalid', 'City region must be a string of at most 100 characters.');
    }
    const latitude = toCoordinate(city.latitude);
    const longitude = toCoordinate(city.longitude);
    if (!isValidLatitude(latitude)) {
      return sendStatus(res, 400, 'invalid-latitude', 'City latitude is required and must be a number between -90 and 90.');
    }
    if (!isValidLongitude(longitude)) {
      return sendStatus(res, 400, 'invalid-longitude', 'City longitude is required and must be a number between -180 and 180.');
    }
    validCities.push({ name: city.name, country: city.country, region: hasRegion ? city.region : null, latitude, longitude });
  }

  // A place is identified by its coordinates, and one statement can't insert the same (user, coordinates) twice
  const coordinateKeys = new Set(validCities.map((city) => `${city.latitude},${city.longitude}`));
  if (coordinateKeys.size !== validCities.length) {
    return sendStatus(res, 400, 'city-duplicate', 'The list contains the same place twice.');
  }

  try {
    // Postgres over Neon's HTTP mode has no transactions, so this is two statements instead of one per city.
    // Upsert first: if the delete then fails, the user has a few extra old cities rather than missing ones.
    if (validCities.length > 0) {
      await prisma.$executeRaw`
        INSERT INTO "cities" ("userId", "name", "country", "region", "latitude", "longitude")
        SELECT ${user.id}::int, name, country, region, latitude, longitude
        FROM unnest(
          ${validCities.map((city) => city.name)}::text[],
          ${validCities.map((city) => city.country)}::text[],
          ${validCities.map((city) => city.region)}::text[],
          ${validCities.map((city) => city.latitude)}::numeric[],
          ${validCities.map((city) => city.longitude)}::numeric[]
        ) WITH ORDINALITY AS incoming(name, country, region, latitude, longitude, position)
        ORDER BY position
        ON CONFLICT ("userId", "latitude", "longitude") DO UPDATE SET
          "name" = EXCLUDED."name",
          "country" = EXCLUDED."country",
          -- A save from a client that doesn't know the region must not erase the one already stored
          "region" = COALESCE(EXCLUDED."region", "cities"."region")`;
    }

    await prisma.city.deleteMany({
      where: {
        userId: user.id,
        NOT: validCities.map((city) => ({ latitude: city.latitude, longitude: city.longitude })),
      },
    });

    return sendStatus(res, 200, 'cities-updated', 'City list updated successfully.');

  } catch (error) {
    console.error('Batch Update Failed:', error);
    return sendStatus(res, 500, 'cities-update-failed', 'Failed to update city list.', { error: process.env.NODE_ENV === 'development' ? (error as { message?: string }).message : undefined });
  }
}