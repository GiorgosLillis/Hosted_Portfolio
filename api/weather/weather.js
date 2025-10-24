import { setCorsHeaders } from '../database/functions.js';
import { rateLimiter } from '../../lib/rateLimiter.js';

const cache = {};

const PathtoImg = 'assets/weather-images/'
const PathtoIcons = 'assets/weather-icons/';
        const weatherCodeMapping = {
            0: { condition: 'Clear sky', dayIcon: PathtoIcons + 'clear-day.svg', nightIcon: PathtoIcons + 'clear-night.svg', dayImg: PathtoImg + 'clear-day.jpg', nightImg: PathtoImg + 'clear-night.jpg'},
            1: { condition: 'Mainly clear', dayIcon: PathtoIcons + 'partly-cloudy-day.svg', nightIcon: PathtoIcons + 'partly-cloudy-night.svg', dayImg: PathtoImg + 'clouds-day.jpg', nightImg: PathtoImg + 'clouds-night.jpg'  },
            2: { condition: 'Partly cloudy', dayIcon: PathtoIcons + 'partly-cloudy-day.svg', nightIcon: PathtoIcons + 'partly-cloudy-night.svg', dayImg: PathtoImg + 'clouds-day.jpg', nightImg: PathtoImg + 'clouds-night.jpg'  },
            3: { condition: 'Overcast', dayIcon: PathtoIcons + 'cloudy.svg', nightIcon: PathtoIcons + 'cloudy.svg', dayImg: PathtoImg + 'overcast.jpg', nightImg: PathtoImg + 'overcast.jpg'  },
            45: { condition: 'Fog', dayIcon: PathtoIcons + 'fog.svg', nightIcon: PathtoIcons + 'fog.svg', dayImg: PathtoImg + 'fog.jpg', nightImg: PathtoImg + 'fog.jpg'  },
            48: { condition: 'Depositing rime fog', dayIcon: PathtoIcons + 'fog.svg', nightIcon: PathtoIcons + 'fog.svg', dayImg: PathtoImg + 'fog.jpg', nightImg: PathtoImg + 'fog.jpg'  },
            51: { condition: 'Drizzle: Light', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'drizzle-day.jpg', nightImg: PathtoImg + 'drizzle-night.jpg'  },
            53: { condition: 'Drizzle: Moderate', dayIcon: PathtoIcons + 'howers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'drizzle-day.jpg', nightImg: PathtoImg + 'drizzle-night.jpg'  },
            55: { condition: 'Drizzle: Dense', dayIcon: PathtoIcons + 'rain.svg', nightIcon: PathtoIcons + 'rain.svg', dayImg: PathtoImg + 'drizzle-day.jpg', nightImg: PathtoImg + 'drizzle-night.jpg'  },
            56: { condition: 'Freezing Drizzle: Light', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg', dayImg: PathtoImg + 'sleet-day.jpg', nightImg: PathtoImg + 'sleet-day.jpg'  },
            57: { condition: 'Freezing Drizzle: Dense', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg', dayImg: PathtoImg + 'sleet-night.jpg', nightImg: PathtoImg + 'sleet-night.jpg'  },
            61: { condition: 'Rain: Slight', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'rain-day.jpg', nightImg: PathtoImg + 'rain-night.jpg'  },
            63: { condition: 'Rain: Moderate', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'rain-day.jpg', nightImg: PathtoImg + 'rain-night.jpg'  },
            65: { condition: 'Rain: Heavy', dayIcon: PathtoIcons + 'rain.svg', nightIcon: PathtoIcons + 'rain.svg', dayImg: PathtoImg + 'rain.jpg', nightImg: PathtoImg + 'rain.jpg'  },
            66: { condition: 'Freezing Rain: Light', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg', dayImg: PathtoImg + 'sleet-day.jpg', nightImg: PathtoImg + 'sleet-night.jpg'  },
            67: { condition: 'Freezing Rain: Heavy', dayIcon: PathtoIcons + 'sleet.svg', nightIcon: PathtoIcons + 'sleet-night.svg', dayImg: PathtoImg + 'sleet-day.jpg', nightImg: PathtoImg + 'sleet-night.jpg'  },
            71: { condition: 'Snow fall: Slight', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg', dayImg: PathtoImg + 'snow-day.jpg', nightImg: PathtoImg + 'snow-night.jpg'  },
            73: { condition: 'Snow fall: Moderate', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg', dayImg: PathtoImg + 'snow-day.jpg', nightImg: PathtoImg + 'snow-night.jpg'  },
            75: { condition: 'Snow fall: Heavy', dayIcon: PathtoIcons + 'snow.svg', nightIcon: PathtoIcons + 'snow.svg', dayImg: PathtoImg + 'heavy-snow.jpg', nightImg: PathtoImg + 'heavy-snow.jpg'  },
            77: { condition: 'Snow grains', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg', dayImg: PathtoImg + 'snow-day.jpg', nightImg: PathtoImg + 'snow-night.jpg'  },
            80: { condition: 'Rain showers: Slight', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'snow-day.jpg', nightImg: PathtoImg + 'snow-night.jpg'  },
            81: { condition: 'Rain showers: Moderate', dayIcon: PathtoIcons + 'showers-day.svg', nightIcon: PathtoIcons + 'showers-night.svg', dayImg: PathtoImg + 'snow-day.jpg', nightImg: PathtoImg + 'snow-night.jpg'  },
            82: { condition: 'Rain showers: Violent', dayIcon: PathtoIcons + 'rain.svg', nightIcon: PathtoIcons + 'rain.svg', dayImg: PathtoImg + 'rain.jpg', nightImg: PathtoImg + 'rain.jpg'  },
            85: { condition: 'Snow showers: Slight', dayIcon: PathtoIcons + 'snow-showers-day.svg', nightIcon: PathtoIcons + 'snow-showers-night.svg', dayImg: PathtoImg + 'snow-day.jpg', nightImg: PathtoImg + 'snow-night.jpg'  },
            86: { condition: 'Snow showers: Heavy', dayIcon: PathtoIcons + 'snow.svg', nightIcon: PathtoIcons + 'snow.svg', dayImg: PathtoImg + 'snow.jpg', nightImg: PathtoImg + 'snow.jpg'  },
            95: { condition: 'Thunderstorm: Slight or moderate', dayIcon: PathtoIcons + 'thunder-showers-day.svg', nightIcon: PathtoIcons + 'thunder-showers-night.svg', dayImg: PathtoImg + 'thunder.jpg', nightImg: PathtoImg + 'thunder.jpg'  },
            96: { condition: 'Thunderstorm with slight hail', dayIcon: PathtoIcons + 'thunder-rain.svg', nightIcon: PathtoIcons + 'thunder-rain-night.svg', dayImg: PathtoImg + 'thunder.jpg', nightImg: PathtoImg + 'thunder.jpg'  },
            99: { condition: 'Thunderstorm with heavy hail', dayIcon: PathtoIcons + 'hail.svg', nightIcon: PathtoIcons + 'hail-night.svg', dayImg: PathtoImg + 'thunder.jpg', nightImg: PathtoImg + 'thunder.jpg'  },
        };

function getNoonInfo(currentDate, hourlyTimes, hourlyWeatherCodes){
    const noonIndex = hourlyTimes.findIndex(hourlyTime => {
        const hourlyDate = new Date(hourlyTime);
        return hourlyDate.getDate() === currentDate.getDate() && hourlyDate.getHours() === 12;
    });

    if (noonIndex !== -1) {
        const noonWeatherCode = hourlyWeatherCodes[noonIndex];
        const dayInfo = weatherCodeMapping[noonWeatherCode];
        return dayInfo || null;
    }
    return null;

}

export default async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const { lat, lon } = req.body;
    
    if (isNaN(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ error: "Invalid latitude. Must be a number between -90 and 90." });
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      return res.status(400).json({ error: "Invalid longitude. Must be a number between -180 and 180." });
  }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const { allowed, ttl } = await rateLimiter(ip, 20, 60);
    if (!allowed) {
        return res.status(429).json({ 
            success: false, 
            message: `Too many requests. Please try again in ${ttl} seconds.` 
        });
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,uv_index,apparent_temperature,is_day&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=7&timezone=auto`;
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide&timezone=auto`;

    if (cache[url] && cache[airQualityUrl]) {
        return res.status(200).json(cache[url]);
    }

    try {
        const [res1, res2] = await Promise.all([
            fetch(url),
            fetch(airQualityUrl)
        ]);

        console.log('\nWeather API response:', {
            status: res1.status,
            statusText: res1.statusText,
            ok: res1.ok
        });

        console.log('Air Quality API response:', {
            status: res2.status, 
            statusText: res2.statusText,
            ok: res2.ok
        });

        if (!res1.ok) {
            throw new Error(`Failed to fetch weather data: ${res1.status}`);
        }
        if (!res2.ok) {
            throw new Error(`Failed to fetch air quality data: ${res2.status}`);
        }

       const [weatherData, airQualityData] = await Promise.all([
            res1.json(),
            res2.json()
        ]);
        if(!weatherData || !weatherData.hourly || !weatherData.daily){
            throw new Error('Incomplete weather data received from API');
        } 

        // Find the index of the hourly entry closest to the current time
        const now = Date.now();
        const hourlyTimestamps = weatherData.hourly.time.map(ts => new Date(ts).getTime());
        let closestIndex = 0;
        let minDiff = Math.abs(hourlyTimestamps[0] - now);
        for (let i = 1; i < hourlyTimestamps.length; i++) {
            const diff = Math.abs(hourlyTimestamps[i] - now);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
        }

        const hourlyInfo = weatherData.hourly.time.map((timestamp, index) => { 
            const hasAirQualityData = index < 120;
            const code = weatherData.hourly.weather_code[index];
            const condition = weatherCodeMapping[code];
            const isDay = weatherData.hourly.is_day[index];

            return {
                timestamp,
                time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'}),
                day: new Date(timestamp).toLocaleDateString(),
                temp: weatherData.hourly.temperature_2m[index],
                apparentTemperature: weatherData.hourly.apparent_temperature[index],
                humidity: weatherData.hourly.relative_humidity_2m[index],
                windDirection: weatherData.hourly.wind_direction_10m[index],
                windSpeed: weatherData.hourly.wind_speed_10m[index],
                uvIndex: weatherData.hourly.uv_index[index],
                isDay: isDay,
                condition: condition.condition,
                airQuality: hasAirQualityData ? {
                    pm10: airQualityData.hourly.pm10[index],
                    pm2_5: airQualityData.hourly.pm2_5[index],
                    carbonMonoxide: airQualityData.hourly.carbon_monoxide[index],
                    nitrogenDioxide: airQualityData.hourly.nitrogen_dioxide[index],
                    ozone: airQualityData.hourly.ozone[index],
                    sulphurDioxide: airQualityData.hourly.sulphur_dioxide[index],
                } : null ,
                icon: isDay ? condition.dayIcon : condition.nightIcon
            };
        });

        const dailyInfo = weatherData.daily.time.map((date, index) => {
            const currentDate = new Date(date);
            const noonInfo = getNoonInfo(currentDate, weatherData.hourly.time, weatherData.hourly.weather_code);
            const noonCondition = noonInfo ? noonInfo.condition : 'Unknown';
            const noonIcon = noonInfo ? noonInfo.dayIcon : PathtoIcons + 'unknown.svg';

            return {
                index,
                date,
                condition: noonCondition,
                icon: noonIcon,
                tempMax: weatherData.daily.temperature_2m_max[index],
                tempMin: weatherData.daily.temperature_2m_min[index],
                sunrise: weatherData.daily.sunrise[index],
                sunset: weatherData.daily.sunset[index]
            }
        });

        // Use the index for current weather
        const isDayCurrent = hourlyInfo[closestIndex].isDay;
        const currentCode = weatherData.hourly.weather_code[closestIndex];
        const currentCondition = weatherCodeMapping[currentCode];
        const airQuality = {
            pm10: airQualityData.hourly.pm10[closestIndex],
            pm2_5: airQualityData.hourly.pm2_5[closestIndex],
            carbonMonoxide: airQualityData.hourly.carbon_monoxide[closestIndex],
            nitrogenDioxide: airQualityData.hourly.nitrogen_dioxide[closestIndex],
            ozone: airQualityData.hourly.ozone[closestIndex],
            sulphurDioxide: airQualityData.hourly.sulphur_dioxide[closestIndex],
        };

        const weatherInfo = {
            current: {
                temperature: weatherData.hourly.temperature_2m[closestIndex],
                apparentTemperature: weatherData.hourly.apparent_temperature[closestIndex],
                condition: currentCondition.condition,
                timestamp: weatherData.hourly.time[closestIndex],
                icon: isDayCurrent ? currentCondition.dayIcon : currentCondition.nightIcon,
                img: isDayCurrent ? currentCondition.dayImg : currentCondition.nightImg,
                windSpeed: weatherData.hourly.wind_speed_10m[closestIndex],
                humidity: weatherData.hourly.relative_humidity_2m[closestIndex],
                uvIndex: weatherData.hourly.uv_index[closestIndex],
                isDay: isDayCurrent,
                airQuality: airQuality,
            },
            hourly: hourlyInfo,
            
            daily: dailyInfo,
        };

        cache[url] = weatherInfo;
        cache[airQualityUrl] = weatherInfo;

        res.status(200).json(weatherInfo);
    } catch (error) {
        console.error('Error fetching weather data: ' + error);
        res.status(500).json({ error: 'Failed to fetch weather data.' });
    }
};

