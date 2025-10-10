// main-index.js - Refactored to use new API functions
import { getLocation, fetchWeather, getCachedWeather} from '../weather/weather-api.js';
import {
    displayLocation,
    displayCurrentWeather,
    showLoadingIndicator,
    showError
} from '../weather/display.js';

// DOM elements
export const current_weather = document.getElementById('current_weather');
export const location = document.getElementById('location');

async function init() {
    showLoadingIndicator();

    try {
        // Get location information
        const locationInfo = await getLocation();
        // Check for fresh cached weather data
        let weatherInfo = getCachedWeather();
        if (weatherInfo) {
            console.log("Weather info is fresh, displaying from localStorage");
        } else {
            console.log("Weather info is older than 1 hour or not found, fetching new data");
            weatherInfo =  await fetchWeather(locationInfo);
        }

        // Display the weather data
        if (weatherInfo && weatherInfo.current) {
            // Display location info
            location.textContent = displayLocation(locationInfo.country, locationInfo.city);
            
            // Display current weather
            current_weather.innerHTML = displayCurrentWeather(
                weatherInfo.current.temperature,
                weatherInfo.current.condition,
                weatherInfo.current.icon,
                weatherInfo.time
            );
        } else {
            showError('Weather data is unavailable.', current_weather);
        }
    } catch (err) {
        console.error("An error occurred during initialization:", err);
        current_weather.innerHTML = err.message
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
});