import { setCorsHeaders } from '../database/functions.js';
import countries from './flat-ui__data-Mon Sep 01 2025.json' with { type: 'json' };
import { rateLimiter } from '../../lib/rateLimiter.js';

const countryCodes = {};
const cache = {};


function TableInit(){
    
    countries.forEach(country => {
      countryCodes[country.Name] = country.Code;
    });
}

TableInit();

function LookUp (country){
  for (const [name, code] of Object.entries(countryCodes)) {
      if (name.toUpperCase() === country.toUpperCase()) {
          return code;
      }
  }
  return '';
}


export default async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
      return res.status(204).end();
  }

  const userKey = `forward_location_attempt:${req.ip}`;
  const { allowed, ttl } = await rateLimiter(userKey, 10, 60); // 10 requests per minute per IP

  if (!allowed) {
      res.setHeader('Retry-After', ttl);
      return res.status(429).json({
          success: false,
          message: `Too many requests. Please try again in ${ttl} seconds.`
      });
  }

  const {city, country} = req.body;
  const apiKey = process.env.LOCATION_API_KEY;

  // Validate city
  if (typeof city !== 'string' || city.trim() === '') {
      return res.status(400).json({ error: "City name is required and must be a non-empty string." });
  }
  if (city.length > 100) { // Example max length
      return res.status(400).json({ error: "City name is too long." });
  }

  // Validate country if provided
  if (country) {
      if (typeof country !== 'string' || country.trim() === '') {
          return res.status(400).json({ error: "Country must be a non-empty string if provided." });
      }
      if (country.length > 100) { // Example max length
          return res.status(400).json({ error: "Country name is too long." });
      }
  }

  if (!apiKey) {
    return res.status(500).json({ error: "OpenCage API key is missing on the server." });
  }

  console.log(city, country);
  try {

    let code = LookUp(country);
    const GeoUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(city)}&countrycode=${encodeURIComponent(code)}&key=${apiKey}&pretty=1&language=en`;

    if (cache[GeoUrl]) {
        return res.status(200).json(cache[GeoUrl]);
    }
    
    const response = await fetch(GeoUrl);
    const data = await response.json();
    console.log("OpenCage API Response:", data);

    if (!response.ok || data.error) {
      console.error("OpenCage Forward Geocoding API error:", data);
      return res.status(response.status).json({ error: data.error || 'Failed to reverse geocode coordinates.' });
    }

    if(data.results.length === 0){
      return res.status(404).json({ error: "City not found." });
    }

    // Map OpenCage's response to a simple format
    const result = data.results[0];
    const lat = result.geometry.lat;
    const lon = result.geometry.lng;
    const CountryName = result.components.country;
    const countryCode = result.components.country_code.toUpperCase();

    const formattedData = {
        latitude: lat,
        longitude: lon,
        country_name: CountryName,
        country: countryCode,
        city: city
    };

    cache[GeoUrl] = formattedData;

    res.status(200).json(formattedData);

  } catch (err) {
    console.error("Forward Geocoding proxy error:", err);
    res.status(500).json({ error: "Server error during forward geocoding." });
  }
};