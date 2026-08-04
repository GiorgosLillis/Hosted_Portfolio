// main-index.js - Refactored to use new API functions
import { getLocation, fetchWeather, getCachedWeather } from '../weather/weather-api.js';
import {
    displayLocation,
    displayCurrentWeather,
    showLoadingIndicator,
    showError
} from '../weather/display.js';

export const current_weather = document.getElementById('current_weather');
export const location = document.getElementById('location');

// Small weather teaser shown on the home page, uses the same API client as the full weather page
async function init() {
    showLoadingIndicator();

    try {
        const locationInfo = await getLocation();
        // Use the cached weather if it's still fresh, only hit the API when it isn't
        let weatherInfo = getCachedWeather();
        if (weatherInfo) {
            console.log("Weather info is fresh, displaying from localStorage");
        } else {
            console.log("Weather info is older than 1 hour or not found, fetching new data");
            weatherInfo = await fetchWeather(locationInfo);
        }

        if (weatherInfo && weatherInfo.current) {
            location.textContent = displayLocation(locationInfo.country, locationInfo.city);
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

document.addEventListener('DOMContentLoaded', () => {
    init();
});