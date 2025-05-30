
module.exports = async (req, res) => {
  const { city, country } = req.query;
  const apiKey = process.env.WEATHER_API_KEY;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (!apiKey) {
    return res.status(500).json({ error: "Missing API key" });
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},${encodeURIComponent(country)}&units=metric&appid=${apiKey}`
    );
    const data = await response.json();

    if (data.cod !== 200) {
      return res.status(data.cod).json({ error: data.message });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("Weather API error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
