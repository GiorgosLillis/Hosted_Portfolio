module.exports = async (req, res) => {
  const { city, country } = req.query; // These come from your frontend
  const apiKey = process.env.WEATHER_API_KEY; // <<< Use the new WeatherAPI.com key

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!apiKey) {
    console.error("WEATHERAPI_KEY is not set in environment variables.");
    return res.status(500).json({ error: "WeatherAPI.com API key is missing" });
  }

  // Basic validation for city and country
  if (!city || !country) {
    return res.status(400).json({ error: "City and country parameters are required." });
  }

  try {
    // WeatherAPI.com endpoint for current weather
    // We'll use 'q' parameter which accepts "City Name, Country Code" (e.g., London,UK)
    const weatherApiUrl = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)},${encodeURIComponent(country)}&aqi=no`; // aqi=no reduces response size

    const response = await fetch(weatherApiUrl);
    const data = await response.json();

    // WeatherAPI.com returns 'error' object if something went wrong
    if (response.status !== 200) { // Check response.status directly for non-200 responses
      const errorMessage = data.error ? data.error.message : "Unknown error from WeatherAPI.com";
      console.error("WeatherAPI.com error response:", data);
      return res.status(response.status).json({ error: errorMessage });
    }

    // Your frontend expects: temp, condition, icon
    const mappedData = {
      main: {
        temp: data.current.temp_c // Temperature in Celsius
      },
      weather: [
        {
          description: data.current.condition.text, // e.g., "Partly cloudy"
          icon: data.current.condition.icon // Full URL to the icon image
        }
      ],
      // Add other relevant fields if your frontend needs them or for future expansion
      // city_name: data.location.name,
      // country_name: data.location.country,
      // humidity: data.current.humidity,
      // wind_kph: data.current.wind_kph
    };

    res.status(200).json(mappedData);
  } catch (err) {
    console.error("Weather API error (network or server issue):", err);
    res.status(500).json({ error: "Server error fetching weather data" });
  }
};
