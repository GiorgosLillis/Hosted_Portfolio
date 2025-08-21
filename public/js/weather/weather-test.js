import React, { useState, useEffect } from 'react';
import { getLocation, fetchWeather, WEATHER_CACHE_KEY } from './weather-api.js';

const HOUR_IN_MILLIS = 60 * 60 * 1000;

function WeatherPage() {
    // 1. State Management: Using useState to track loading, data, and errors
    const [weatherData, setWeatherData] = useState(null);
    const [locationInfo, setLocationInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // 2. Data Fetching: Using useEffect to fetch data when the component mounts
    useEffect(() => {
        const init = async () => {
            try {
                // Check local storage for cached data
                const cachedWeather = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
                const currentTime = new Date().getTime();
                
                let locInfo = await getLocation();
                setLocationInfo(locInfo);

                if (cachedWeather && (currentTime - cachedWeather.timestamp < HOUR_IN_MILLIS)) {
                    console.log("Weather info is fresh, displaying from localStorage");
                    setWeatherData(cachedWeather);
                } else {
                    console.log("Weather info is older than 1 hour or not found, fetching new data");
                    await fetchWeather(locInfo);
                    const freshWeather = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
                    setWeatherData(freshWeather);
                }
            } catch (err) {
                // Handle any errors during fetching
                console.error("An error occurred during initialization:", err);
                setError("Failed to get location or weather data.");
            } finally {
                // Hide the loading indicator once fetching is complete
                setLoading(false);
            }
        };

        init();
    }, []); // The empty array ensures this effect runs only once on mount

    // 3. Conditional Rendering: Displaying UI based on the component's state
    if (loading) {
        return <div><p>Loading weather...</p></div>;
    }

    if (error) {
        return <div><p style={{ color: 'red' }}>{error}</p></div>;
    }

    if (!weatherData || !weatherData.current) {
        return <div><p>Weather data is not available.</p></div>;
    }

    // This is where you will render the full UI (cards, carousel, etc.)
    return (
        <div>
            <h2>Weather for {locationInfo.city}, {locationInfo.country}</h2>
            <p>Temperature: {weatherData.current.temperature}°C</p>
            <p>Condition: {weatherData.current.condition}</p>
            <img src={weatherData.current.icon} alt={weatherData.current.condition} />
        </div>
    );
}

export default WeatherPage;