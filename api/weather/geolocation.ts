import { setCorsHeaders, getClientIp, enforceRateLimits, fetchWithTimeout, sendStatus } from '../lib/http.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Nominatim's usage policy requires a descriptive User-Agent
const NOMINATIM_HEADERS = {
  'User-Agent': 'Hosted Portfolio App - (https://www.giorgoslillis.com/)'
};

async function queryNominatim(url: string) {
  const response = await fetchWithTimeout(url, 8000, { headers: NOMINATIM_HEADERS });
  const data = await response.json() as any;
  return { response, data };
}

// Languages the site is translated into, anything else falls back to English
const SUPPORTED_LANGS = ['en', 'el'];
const pickLanguage = (lang: unknown) => (typeof lang === 'string' && SUPPORTED_LANGS.includes(lang) ? lang : 'en');

// Nominatim files whole municipalities under "city" for some countries (Greece: "Municipal Unit of Tripoli"), drop that wording
const ADMIN_PREFIX = /^(Municipal Unit|Municipality|Community|Regional Unit|Region|Prefecture|Perfecture) of\s+/i;
const ADMIN_SUFFIX = /\s+(Community|Municipal Unit|Municipality)$/i;

function cleanPlaceName(name?: string) {
  return name?.replace(ADMIN_PREFIX, '').replace(ADMIN_SUFFIX, '').trim() || undefined;
}

// Nominatim doesn't always return a "city" field, hence the fallback chain, from the most to the least specific place
function extractLocation(address: any, cityOverride?: string) {
  const place = cityOverride || [address.city, address.town, address.village, address.hamlet, address.municipality, address.city_district, address.county]
    .map(cleanPlaceName)
    .find(Boolean);

  return {
    country_name: address.country,
    country: address.country_code.toUpperCase(),
    city: place,
    state: cleanPlaceName(address.state)
  };
}

// Shared IP rate limit + 24h edge cache, identical for both directions
async function applyGeoRateLimit(req: VercelRequest, res: VercelResponse, keyPrefix: string): Promise<boolean> {
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');
  const ip = getClientIp(req);
  return enforceRateLimits(res, [`${keyPrefix}:${ip}`, 30, 60]); // 30 requests per minute per IP, translating a list of saved cities makes one per city
}

// Coordinates -> city/country name
async function reverseLocation(req: VercelRequest, res: VercelResponse) {
  if (!(await applyGeoRateLimit(req, res, 'reverse_location_attempt'))) return;

  const { lat, lon } = req.method === 'GET' ? req.query : req.body;

  const parsedLat = parseFloat(lat);
  if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
    return sendStatus(res, 400, 'invalid-latitude', "Invalid latitude. Must be a number between -90 and 90.");
  }

  const parsedLon = parseFloat(lon);
  if (isNaN(parsedLon) || parsedLon < -180 || parsedLon > 180) {
    return sendStatus(res, 400, 'invalid-longitude', "Invalid longitude. Must be a number between -180 and 180.");
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${parsedLat}&lon=${parsedLon}&addressdetails=1&accept-language=en`; // always English, the name cleanup above relies on it, the client translates it afterwards
    const { response, data } = await queryNominatim(url);

    if (!response.ok || data.error) {
      console.error("OpenStreetMap Reverse Geocoding API error:", data.error || response.statusText);
      return sendStatus(res, response.status, 'geocode-failed', data.error || 'Failed to reverse geocode coordinates.');
    }

    res.status(200).json(extractLocation(data.address));

  } catch (err) {
    console.error("Reverse Geocoding proxy error:", err);
    sendStatus(res, 500, 'geocode-error', "Server error during reverse geocoding.");
  }
}

// City name -> coordinates
async function forwardLocation(req: VercelRequest, res: VercelResponse) {
  if (!(await applyGeoRateLimit(req, res, 'forward_location_attempt'))) return;

  const { city, country, state, lang } = req.method === 'GET' ? req.query : req.body;

  if (typeof city !== 'string' || city.trim() === '') {
    return sendStatus(res, 400, 'city-name-required', "City name is required and must be a non-empty string.");
  }
  if (city.length > 100) {
    return sendStatus(res, 400, 'city-name-long', "City name is too long.");
  }

  if (country) {
    if (typeof country !== 'string' || country.trim() === '') {
      return sendStatus(res, 400, 'country-invalid', "Country must be a non-empty string if provided.");
    }
    if (country.length > 100) {
      return sendStatus(res, 400, 'country-long', "Country name is too long.");
    }
  }
  if (state) {
    if (typeof state !== 'string' || state.trim() === '' || state.length > 100) {
      return sendStatus(res, 400, 'state-invalid', "State must be a non-empty string of at most 100 characters if provided.");
    }
  }

  try {
    const stateParam = state ? `&state=${encodeURIComponent(state)}` : '';
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}${stateParam}&format=json&limit=1&addressdetails=1&accept-language=${pickLanguage(lang)}`;
    const { response, data } = await queryNominatim(url);

    if (!response.ok || data.error) {
      console.error("OpenStreetMap Forward Geocoding API error:", data);
      return sendStatus(res, response.status, 'geocode-failed', data.error || 'Failed to forward geocode coordinates.');
    }

    if (data === undefined || data.length === 0) {
      return sendStatus(res, 404, 'city-not-found', "City not found.");
    }

    const result = data[0];
    res.status(200).json({
      latitude: result.lat,
      longitude: result.lon,
      // A boundary result's name is the whole municipality, only a real place's name is used as is
      ...extractLocation(result.address, result.class === 'place' ? result.name : undefined)
    });

  } catch (err) {
    console.error("Forward Geocoding proxy error:", err);
    sendStatus(res, 500, 'geocode-error', "Server error during forward geocoding.");
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { action } = req.query;

  if (action === 'reverse') {
    return reverseLocation(req, res);
  } else if (action === 'forward') {
    return forwardLocation(req, res);
  }

  return sendStatus(res, 400, 'unknown-action', "Unknown or missing geolocation action.");
}
