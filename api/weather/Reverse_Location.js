import 'dotenv/config';
import { rateLimiter } from '../../lib/rateLimiter.js';
import { setCorsHeaders } from '../database/functions.js';

const cache = {};

export default async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Cache for 24 hours (86400s) at the Edge. 
  // stale-while-revalidate allows serving old content while updating in background.
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');

  const userKey = `reverse_location_attempt:${req.ip}`;
  const { allowed, ttl } = await rateLimiter(userKey, 10, 60); // 10 requests per minute per IP

  if (!allowed) {
    res.setHeader('Retry-After', ttl);
    return res.status(429).json({
      success: false,
      message: `Too many requests. Please try again in ${ttl} seconds.`
    });
  }

  const { lat, lon } = req.method === 'GET' ? req.query : req.body;

  // Validate latitude
  const parsedLat = parseFloat(lat);
  if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
    return res.status(400).json({ error: "Invalid latitude. Must be a number between -90 and 90." });
  }

  // Validate longitude
  const parsedLon = parseFloat(lon);
  if (isNaN(parsedLon) || parsedLon < -180 || parsedLon > 180) {
    return res.status(400).json({ error: "Invalid longitude. Must be a number between -180 and 180." });
  }

  try {
    const reverseGeoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${parsedLat}&lon=${parsedLon}&addressdetails=1&accept-language=en`;

    if (cache[reverseGeoUrl]) {
      return res.status(200).json(cache[reverseGeoUrl]);
    }

    const response = await fetch(reverseGeoUrl, {
      headers: {
        'User-Agent': 'Hosted Portfolio App - (https://www.giorgoslillis.com/)'
      }
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      console.error("OpenStreetMap Reverse Geocoding API error:", data.error || response.statusText);
      return res.status(response.status).json({ error: data.error || 'Failed to reverse geocode coordinates.' });
    }

    // Map Open's response to a simple format
    const result = data.address;
    const country = result.country;
    const countryCode = result.country_code.toUpperCase();
    const city = result.city || result.town || result.village || result.county;

    const formattedData = {
      country_name: country,
      country: countryCode,
      city: city
    };

    cache[reverseGeoUrl] = formattedData;

    res.status(200).json(formattedData);

  } catch (err) {
    console.error("Reverse Geocoding proxy error:", err);
    res.status(500).json({ error: "Server error during reverse geocoding." });
  }
};