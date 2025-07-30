module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { lat, lon } = req.query;
  const apiKey = process.env.LOCATION_API_KEY;

  if (!lat || !lon) {
    return res.status(400).json({ error: "Latitude and Longitude are required." });
  }
  if (!apiKey) {
    return res.status(500).json({ error: "OpenCage API key is missing on the server." });
  }

  try {
    // It takes 'latitude' and 'longitude' as parameters
    const reverseGeoUrl = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lon}&key=${apiKey}&pretty=1&language=en`;
    console.log("Calling OpenCage Reverse Geocoding URL:", reverseGeoUrl);

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

    res.status(200).json(formattedData);

  } catch (err) {
    console.error("Reverse Geocoding proxy error:", err);
    res.status(500).json({ error: "Server error during reverse geocoding." });
  }
};