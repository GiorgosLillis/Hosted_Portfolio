module.exports = async (req, res) => {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    // URL to get hourly data for 7 days
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&forecast_days=7&timezone=auto`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return res.status(500).json({ error: data.reason });
        }

        const PathtoIcons = 'public/assets/weather-icons/';
        const weatherCodeMapping = {
            0: { condition: 'Clear sky', icon: PathtoIcons + 'clear-day.svg' },
            1: { condition: 'Mainly clear', icon: PathtoIcons + 'partly-cloudy-day.svg' },
            2: { condition: 'Partly cloudy', icon: PathtoIcons + 'partly-cloudy-day.svg' },
            3: { condition: 'Overcast', icon: PathtoIcons + 'cloudy.svg' },
            45: { condition: 'Fog', icon: PathtoIcons + 'fog.svg' },
            48: { condition: 'Depositing rime fog', icon: PathtoIcons + 'fog.svg' },
            51: { condition: 'Drizzle: Light', icon: PathtoIcons + 'rain.svg' },
            53: { condition: 'Drizzle: Moderate', icon: PathtoIcons + 'rain.svg' },
            55: { condition: 'Drizzle: Dense', icon: PathtoIcons + 'rain.svg' },
            61: { condition: 'Rain: Slight', icon: PathtoIcons + 'rain.svg' },
            63: { condition: 'Rain: Moderate', icon: PathtoIcons + 'rain.svg' },
            65: { condition: 'Rain: Heavy', icon: PathtoIcons + 'rain.svg' },
            80: { condition: 'Rain showers: Slight', icon: PathtoIcons + 'showers-day.svg' },
            81: { condition: 'Rain showers: Moderate', icon: PathtoIcons + 'showers-day.svg' },
            82: { condition: 'Rain showers: Violent', icon: PathtoIcons + 'showers-day.svg' },
        };

        const weatherInfo = {
            current: {
            temperature: data.hourly.temperature_2m[0],
            condition: weatherCodeMapping[data.hourly.weather_code[0]].condition,
            icon: weatherCodeMapping[data.hourly.weather_code[0]].icon,
            windSpeed: data.hourly.wind_speed_10m[0],
            humidity: data.hourly.relative_humidity_2m[0],
            },
            // Filter hourly data to get a 3-hour step forecast
            forecast: data.hourly.time.filter((_, index) => index % 3 === 0).map((timestamp, index) => {
            const hourIndex = index * 3;
            const code = data.hourly.weather_code[hourIndex];
            const condition = weatherCodeMapping[code] || { condition: 'Unknown', icon: '❓' };
            
            return {
                timestamp,
                time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                day: new Date(timestamp).toLocaleDateString(),
                temp: data.hourly.temperature_2m[hourIndex],
                condition: condition.condition,
                icon: condition.icon,
            };
            }),
        };

        // Log the days it forecasts
        const forecastDays = [...new Set(weatherInfo.forecast.map(f => f.day))];
        console.log("Forecast days:", forecastDays);
        res.status(200).json(weatherInfo);

    } catch (error) {
        console.error('Error fetching weather data:', error);
        res.status(500).json({ error: 'Failed to fetch weather data.' });
    }
};
