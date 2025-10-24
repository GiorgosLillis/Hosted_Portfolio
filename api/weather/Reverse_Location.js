import 'dotenv/config';
import { rateLimiter } from '../../lib/rateLimiter.js';
import { setCorsHeaders } from '../database/functions.js';

const cache = {};

export default async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
      return res.status(204).end();
  }

  const userKey = `reverse_location_attempt:${req.ip}`;
  const { allowed, ttl } = await rateLimiter(userKey, 10, 60); // 10 requests per minute per IP

  if (!allowed) {
      res.setHeader('Retry-After', ttl);
      return res.status(429).json({
          success: false,
          message: `Too many requests. Please try again in ${ttl} seconds.`
      });
  }

  const { lat, lon } = req.body;
  const apiKey = process.env.LOCATION_API_KEY;

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

  if (!apiKey) {
    return res.status(500).json({ error: "OpenCage API key is missing on the server." });
  }

  try {
    const reverseGeoUrl = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lon}&key=${apiKey}&pretty=1&language=en`;

    if (cache[reverseGeoUrl]) {
        return res.status(200).json(cache[reverseGeoUrl]);
    }

    const response = await fetch(reverseGeoUrl);
    const data = await response.json();


    if (!response.ok || data.error) {
      console.error("OpenCage Reverse Geocoding API error:", data);
      return res.status(response.status).json({ error: data.error || 'Failed to reverse geocode coordinates.' });
    }

    // Map OpenCage's response to a simple format
    const result = data.results[0];

    const country = result.components.country;
    const countryCode = result.components.country_code.toUpperCase();
    let city = result.components.city || result.components.town || result.components.village || result.components.county;

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