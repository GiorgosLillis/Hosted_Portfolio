import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Import the components from the new file.
import {LoadingIndicator, ErrorMessage, setBackgroundImage } from './display.jsx';
import CurrentWeather from './current-weather.jsx';
import { fetchWeather, getLocation, getCachedWeather } from '../weather/weather-api.js';
import WeatherForecast  from './daily-card.jsx';
import ViewToggle from './view-toggle.jsx';
import  HourlyForecast  from './hourly-card.jsx';

// Main application component
function WeatherApp() {
    const [weatherData, setWeatherData] = useState(null);
    const [locationInfo, setLocationInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [viewMode, setViewMode] = useState('daily');
    const [selectedDayHourly, setSelectedDayHourly] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);

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
                        console.log('Weather data is fresh, using from localStorage');
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

    const handleDayClick = (day) => {
        const selectedDay = new Date(day.date).getDate();
        const hourlyForSelectedDay = weatherData.hourly.filter(hour => {
            const hourDay = new Date(hour.timestamp).getDate();
            return hourDay === selectedDay;
        });
        setSelectedDayHourly(hourlyForSelectedDay);
        setSelectedDate(new Date(day.date));
        setViewMode('hourly');
    };
    
    if (loading) {
        return <LoadingIndicator />;
    }

    if (error) {
        return <ErrorMessage error={error} />;
    }

    if (!weatherData) {
        return (
            <div className="text-danger text-center fs-3">
                No weather data available
            </div>
        );
    }

    return (
        <>
        <CurrentWeather
            locationInfo={locationInfo}
            weatherData={weatherData}
            lastUpdate={lastUpdate}
        />
        <div className="flex-grow-1 d-flex flex-column justify-content-end mb-5 pb-5"> 
            <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
            {viewMode === 'daily' ? (
                <WeatherForecast dailyForecast={weatherData.daily} onDayClick={handleDayClick} />
            ) : (
                <HourlyForecast
                    hourlyForecast={selectedDayHourly || weatherData.hourly}
                    isToday={selectedDate ? new Date().toDateString() === selectedDate.toDateString() : true}
                />
            )}
        </div>
         </>
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