import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Import the components from the new file.
import { CurrentWeather, LoadingIndicator, ErrorMessage, setBackgroundImage } from './display.jsx';
import { fetchWeather, getLocation, getCachedWeather } from './weather-api.js';

// Main application component
function WeatherApp() {
    const [weatherData, setWeatherData] = useState(null);
    const [locationInfo, setLocationInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);

    // Import the weather API function

    const initializeWeather = async () => {
            try {
                    setLoading(true);
                    setError(null);

                    const location = await getLocation();
                    if (!location){
                        throw new Error("Unable to retrieve location");
                    }

                    // Fetch weather data from API
                    const cachedWeather = getCachedWeather();
                    if (cachedWeather){
                        console.log('Using cached weather data');
                        setLocationInfo(location);
                        setWeatherData(cachedWeather);
                        setLastUpdate(new Date(cachedWeather.time));
                        return;
                    }
                    const weatherData = await fetchWeather(location);
                    if (!weatherData) {
                        throw new Error("Unable to fetch weather data");
                    }

                    // Assume data contains { weatherData, locationInfo, time }
                    setLocationInfo(location);
                    setWeatherData(weatherData);
                    setLastUpdate(new Date(weatherData.time));

            } catch (err) {
                    console.error("Weather initialization failed:", err);
                    setError(err.message || "Failed to fetch weather data");
            } finally {
                    setLoading(false);
            }
    };

    useEffect(() => {
            initializeWeather();
    }, []);

    useEffect(() => {
        setBackgroundImage(weatherData?.current?.img);
    }, [weatherData?.current?.img]);
    
    if (loading) {
        return <LoadingIndicator />;
    }

    if (error) {
        return <ErrorMessage error={error} />;
    }

    if (!weatherData) {
        return (
            <div className="alert alert-warning">
                No weather data available
            </div>
        );
    }

    return (
        <CurrentWeather
            locationInfo={locationInfo}
            weatherData={weatherData}
            lastUpdate={lastUpdate}
        />
    );
}

// Mount the React component
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('weather-app');
  if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(<WeatherApp />);
  } else {
    console.error('Root container not found in the DOM.');
  }
});