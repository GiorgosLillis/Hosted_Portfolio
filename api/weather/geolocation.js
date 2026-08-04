import { setCorsHeaders, getClientIp, enforceRateLimit } from '../lib/functions.js';

// Nominatim's usage policy requires a descriptive User-Agent
const NOMINATIM_HEADERS = {
  'User-Agent': 'Hosted Portfolio App - (https://www.giorgoslillis.com/)'
};

async function queryNominatim(url) {
  const response = await fetch(url, { headers: NOMINATIM_HEADERS });
  const data = await response.json();
  return { response, data };
}

// Nominatim doesn't always return a "city" field, hence the fallback chain
function extractLocation(address, cityOverride) {
  return {
    country_name: address.country,
    country: address.country_code.toUpperCase(),
    city: cityOverride || address.city || address.town || address.village || address.county
  };
}

// Shared IP rate limit + 24h edge cache, identical for both directions
async function applyGeoRateLimit(req, res, keyPrefix) {
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');
  const ip = getClientIp(req);
  return enforceRateLimit(res, `${keyPrefix}:${ip}`, 10, 60); // 10 requests per minute per IP
}

// Coordinates -> city/country name
async function reverseLocation(req, res) {
  if (!(await applyGeoRateLimit(req, res, 'reverse_location_attempt'))) return;

  const { lat, lon } = req.method === 'GET' ? req.query : req.body;

  const parsedLat = parseFloat(lat);
  if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
    return res.status(400).json({ error: "Invalid latitude. Must be a number between -90 and 90." });
  }

  const parsedLon = parseFloat(lon);
  if (isNaN(parsedLon) || parsedLon < -180 || parsedLon > 180) {
    return res.status(400).json({ error: "Invalid longitude. Must be a number between -180 and 180." });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${parsedLat}&lon=${parsedLon}&addressdetails=1&accept-language=en`;
    const { response, data } = await queryNominatim(url);

    if (!response.ok || data.error) {
      console.error("OpenStreetMap Reverse Geocoding API error:", data.error || response.statusText);
      return res.status(response.status).json({ error: data.error || 'Failed to reverse geocode coordinates.' });
    }

    res.status(200).json(extractLocation(data.address));

  } catch (err) {
    console.error("Reverse Geocoding proxy error:", err);
    res.status(500).json({ error: "Server error during reverse geocoding." });
  }
}

// City name -> coordinates
async function forwardLocation(req, res) {
  if (!(await applyGeoRateLimit(req, res, 'forward_location_attempt'))) return;

  const { city, country } = req.method === 'GET' ? req.query : req.body;

  if (typeof city !== 'string' || city.trim() === '') {
    return res.status(400).json({ error: "City name is required and must be a non-empty string." });
  }
  if (city.length > 100) {
    return res.status(400).json({ error: "City name is too long." });
  }

  if (country) {
    if (typeof country !== 'string' || country.trim() === '') {
      return res.status(400).json({ error: "Country must be a non-empty string if provided." });
    }
    if (country.length > 100) {
      return res.status(400).json({ error: "Country name is too long." });
    }
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&format=json&limit=1&addressdetails=1&accept-language=en`;
    const { response, data } = await queryNominatim(url);

    if (!response.ok || data.error) {
      console.error("OpenStreetMap Forward Geocoding API error:", data);
      return res.status(response.status).json({ error: data.error || 'Failed to forward geocode coordinates.' });
    }

    if (data === undefined || data.length === 0) {
      return res.status(404).json({ error: "City not found." });
    }

    const result = data[0];
    res.status(200).json({
      latitude: result.lat,
      longitude: result.lon,
      ...extractLocation(result.address, result.name)
    });

  } catch (err) {
    console.error("Forward Geocoding proxy error:", err);
    res.status(500).json({ error: "Server error during forward geocoding." });
  }
}

export default async function handler(req, res) {
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

  return res.status(400).json({ error: "Unknown or missing geolocation action." });
}
