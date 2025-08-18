const PathtoIcons = 'public/assets/weather-icons/';
        const weatherCodeMapping = {
            0: { condition: 'Clear sky', dayIcon: PathtoIcons + 'clear-day.svg', nightIcon: PathtoIcons + 'clear-night.svg' },
            1: { condition: 'Mainly clear', dayIcon: PathtoIcons + 'partly-cloudy-day.svg', nightIcon: PathtoIcons + 'partly-cloudy-night.svg'  },
            2: { condition: 'Partly cloudy', dayIcon: PathtoIcons + 'partly-cloudy-day.svg', nightIcon: PathtoIcons + 'partly-cloudy-night.svg'  },
            3: { condition: 'Overcast', dayIcon: PathtoIcons + 'cloudy.svg', nightIcon: PathtoIcons + 'cloudy-night.svg'  },
            45: { condition: 'Fog', dayIcon: PathtoIcons + 'fog.svg', nightIcon: PathtoIcons + 'fog-night.svg'  },
            48: { condition: 'Depositing rime fog', dayIcon: PathtoIcons + 'fog.svg', nightIcon: PathtoIcons + 'fog-night.svg'  },
            51: { condition: 'Drizzle: Light', dayIcon: PathtoIcons + 'rain-showers-day.svg', nightIcon: PathtoIcons + 'rain-showers-night.svg'  },
            53: { condition: 'Drizzle: Moderate', dayIcon: PathtoIcons + 'rain-showers-day.svg', nightIcon: PathtoIcons + 'rain-showers-night.svg'  },
            55: { condition: 'Drizzle: Dense', dayIcon: PathtoIcons + 'rain.svg', nightIcon: PathtoIcons + 'rain-night.svg'  },
            56: { condition: 'Freezing Drizzle: Light', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg'  },
            57: { condition: 'Freezing Drizzle: Dense', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg'  },
            61: { condition: 'Rain: Slight', dayIcon: PathtoIcons + 'rain-showers-day.svg', nightIcon: PathtoIcons + 'rain-showers-night.svg'  },
            63: { condition: 'Rain: Moderate', dayIcon: PathtoIcons + 'rain-showers-day.svg', nightIcon: PathtoIcons + 'rain-showers-night.svg'  },
            65: { condition: 'Rain: Heavy', dayIcon: PathtoIcons + 'rain.svg', nightIcon: PathtoIcons + 'rain-night.svg'  },
            66: { condition: 'Freezing Rain: Light', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg'  },
            67: { condition: 'Freezing Rain: Heavy', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg'  },
            71: { condition: 'Snow fall: Slight', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg'  },
            73: { condition: 'Snow fall: Moderate', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg'  },
            75: { condition: 'Snow fall: Heavy', dayIcon: PathtoIcons + 'snow.svg', nightIcon: PathtoIcons + 'snow-night.svg'  },
            77: { condition: 'Snow grains', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg'  },
            80: { condition: 'Rain showers: Slight', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg'  },
            81: { condition: 'Rain showers: Moderate', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg'  },
            82: { condition: 'Rain showers: Violent', dayIcon: PathtoIcons + 'rain.svg', nightIcon: PathtoIcons + 'rain-night.svg'  },
            85: { condition: 'Snow showers: Slight', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg'  },
            86: { condition: 'Snow showers: Heavy', dayIcon: PathtoIcons + 'snow.svg', nightIcon: PathtoIcons + 'snow-night.svg'  },
            95: { condition: 'Thunderstorm: Slight or moderate', dayIcon: PathtoIcons + 'thunder-showers-day.svg', nightIcon: PathtoIcons + 'thunder-showers-night.svg'  },
            96: { condition: 'Thunderstorm with slight hail', dayIcon: PathtoIcons + 'thunder-rain.svg', nightIcon: PathtoIcons + 'thunder-rain-night.svg'  },
            99: { condition: 'Thunderstorm with heavy hail', dayIcon: PathtoIcons + 'hail.svg', nightIcon: PathtoIcons + 'hail-night.svg'  },
        };

module.exports = async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);

    if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,uv_index,apparent_temperature,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`;
    try {
        const response = await fetch(url);
        if (response.status !== 200) {
            return res.status(response.status).json({ error: 'Failed to fetch weather data from external API.' });
        }

        const data = await response.json();

        if (data.error) {
            return res.status(400).json({ error: data.reason });
        }

        function isDayTime(timestamp) {
            const hour = new Date(timestamp).getHours();
            return hour >= 6 && hour < 20;
        }

        // Find the index of the hourly entry closest to now
        const now = Date.now();
        const hourlyTimestamps = data.hourly.time.map(ts => new Date(ts).getTime());
        let closestIndex = 0;
        let minDiff = Math.abs(hourlyTimestamps[0] - now);
        for (let i = 1; i < hourlyTimestamps.length; i++) {
            const diff = Math.abs(hourlyTimestamps[i] - now);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
        }

        const hourlyInfo = data.hourly.time.map((timestamp, index) => {
            const code = data.hourly.weather_code[index];
            const condition = weatherCodeMapping[code];
            let isDay = data.hourly.is_day[index];
            
            if (index === closestIndex) {
                const localIsDayTime = isDayTime(timestamp);
                if (!isDay && localIsDayTime) {
                    isDay = 1;
                }
            }

            return {
                timestamp,
                time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                day: new Date(timestamp).toLocaleDateString(),
                temp: data.hourly.temperature_2m[index],
                apparentTemperature: data.hourly.apparent_temperature[index],
                humidity: data.hourly.relative_humidity_2m[index],
                windSpeed: data.hourly.wind_speed_10m[index],
                uvIndex: data.hourly.uv_index[index],
                isDay: isDay,
                condition: condition.condition,
                icon: isDay ? condition.dayIcon : condition.nightIcon
            };
        });

        const dailyInfo = data.daily.time.map((date, index) => ({
            date,
            tempMax: data.daily.temperature_2m_max[index],
            tempMin: data.daily.temperature_2m_min[index],
        }));

        // Use the closestIndex for current weather
        const isDayCurrent = hourlyInfo[closestIndex].isDay;
        const currentCode = data.hourly.weather_code[closestIndex];
        const currentCondition = weatherCodeMapping[currentCode];

        const weatherInfo = {
            current: {
                temperature: data.hourly.temperature_2m[closestIndex],
                apparentTemperature: data.hourly.apparent_temperature[closestIndex],
                condition: currentCondition.condition,
                icon: isDayCurrent ? currentCondition.dayIcon : currentCondition.nightIcon,
                windSpeed: data.hourly.wind_speed_10m[closestIndex],
                humidity: data.hourly.relative_humidity_2m[closestIndex],
                uvIndex: data.hourly.uv_index[closestIndex],
                isDay: isDayCurrent,
            },
            hourly: hourlyInfo,
            daily: dailyInfo,
        };

        res.status(200).json(weatherInfo);
    } catch (error) {
        console.error('Error fetching weather data:' + error);
        res.status(500).json({ error: 'Failed to fetch weather data.' });
    }
};
