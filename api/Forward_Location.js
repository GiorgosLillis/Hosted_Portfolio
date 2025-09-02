const countries = require('./flat-ui__data-Mon Sep 01 2025.json');

// Move countryCodes to module scope
const countryCodes = {};

function TableInit(){
    countries.forEach(country => {
      // Ensure correct property names based on your JSON structure
      countryCodes[country.Name] = country.Code;
    });
}

function LookUp (country){
  for (const [name, code] of Object.entries(countryCodes)) {
      if (name.toUpperCase() === country.toUpperCase()) {
          return code;
      }
  }
  return '';
}


module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const {city, country} = req.query;
  const apiKey = process.env.LOCATION_API_KEY;

  if (!city) {
    return res.status(400).json({ error: "City name is required." });
  }
  if(!country){
    console.log('Country is not required!');
  }
  if (!apiKey) {
    return res.status(500).json({ error: "OpenCage API key is missing on the server." });
  }

  console.log(city, country);
  try {

    let GeoUrl;

    TableInit();
    let code = LookUp(country);
    GeoUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(city)}&countrycode=${encodeURIComponent(code)}&key=${apiKey}&pretty=1&language=en`;
    
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

    res.status(200).json(formattedData);

  } catch (err) {
    console.error("Forward Geocoding proxy error:", err);
    res.status(500).json({ error: "Server error during forward geocoding." });
  }
};