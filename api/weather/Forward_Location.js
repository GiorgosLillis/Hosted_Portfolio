import { setCorsHeaders } from '../database/functions.js';
import { rateLimiter } from '../../lib/rateLimiter.js';

const cache = {};

export default async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // Cache for 24 hours at the Edge
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');

    const userKey = `forward_location_attempt:${req.ip}`;
    const { allowed, ttl } = await rateLimiter(userKey, 10, 60); // 10 requests per minute per IP

    if (!allowed) {
        res.setHeader('Retry-After', ttl);
        return res.status(429).json({
            success: false,
            message: `Too many requests. Please try again in ${ttl} seconds.`
        });
    }

    const { city, country } = req.method === 'GET' ? req.query : req.body;

    // Validate city
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

    console.log(city, country);
    try {


        const GeoUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&format=json&limit=1&addressdetails=1&accept-language=en`;

        if (cache[GeoUrl]) {
            return res.status(200).json(cache[GeoUrl]);
        }

        const response = await fetch(GeoUrl, {
            headers: {
                'User-Agent': 'Hosted Portfolio App - (https://www.giorgoslillis.com/)'
            }
        });
        const data = await response.json();
        console.log("OpenStreetMap API Response:", data);

        if (!response.ok || data.error) {
            console.error("OpenStreetMap Forward Geocoding API error:", data);
            return res.status(response.status).json({ error: data.error || 'Failed to forward geocode coordinates.' });
        }

        if (data === undefined || data.length === 0) {
            return res.status(404).json({ error: "City not found." });
        }

        const result = data[0].address;
        const lat = data[0].lat;
        const lon = data[0].lon;
        const CountryName = result.country;
        const countryCode = result.country_code.toUpperCase();
        const name = data[0].name || result.city || result.town || result.village || result.county;
        const formattedData = {
            latitude: lat,
            longitude: lon,
            country_name: CountryName,
            country: countryCode,
            city: name
        };

        cache[GeoUrl] = formattedData;

        res.status(200).json(formattedData);

    } catch (err) {
        console.error("Forward Geocoding proxy error:", err);
        res.status(500).json({ error: "Server error during forward geocoding." });
    }
};