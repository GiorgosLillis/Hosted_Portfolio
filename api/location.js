const dotenv = require('dotenv');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  dotenv.config();

  const apiKey = process.env.LOCATION_API_KEY;

  if (!apiKey) {
    console.error("IPGeolocation_API_KEY is not set in environment variables.");
    return res.status(500).json({ error: "IPGeolocation API key is missing on the server." });
  }

  try {

    const ipGeoApiUrl = `https://api.ipgeolocation.io/ipgeo?apiKey=${apiKey}`;
    const response = await fetch(ipGeoApiUrl);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      console.error("IPGeolocation API error response:", errorData);
      return res.status(response.status).json({ error: errorData.error || `Failed to fetch location from IPGeolocation: ${response.statusText}` });
    }

    const data = await response.json();

    // Check if IPGeolocation returned a valid response with required fields
    if (!data || !data.country_name || !data.country_code2 || !data.city) {
      console.error("Invalid data structure from IPGeolocation.io:", data);
      return res.status(500).json({ error: "Invalid location data received from IPGeolocation.io API." });
    }

    const formattedData = {
      country_name: data.country_name,
      country: data.country_code2, // Use country_code2 for the 2-letter country code
      city: data.city
    };

    res.status(200).json(formattedData);
  } catch (err) {
    console.error("IPGeolocation proxy error (network/fetch issue):", err);
    res.status(500).json({ error: "Server error fetching location data (network or other issue)" });
  }
};