// main-index.js - Refactored to use new API functions
import { getLocation, fetchWeather, getCachedWeather, isWeatherDataFresh } from '../weather/weather-api.js';
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
    showLoadingIndicator(current_weather);

    try {
        // Get location information
        const locationInfo = await getLocation();
        
        // Check for fresh cached weather data
        let weatherInfo = getCachedWeather();
        
        if (weatherInfo) {
            console.log("Weather info is fresh, displaying from localStorage");
        } else {
            console.log("Weather info is older than 1 hour or not found, fetching new data");
            await fetchWeather(locationInfo);
            weatherInfo = getCachedWeather();
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
            current_weather.textContent = ("Weather data is not available.", current_weather);
        }
    } catch (err) {
        console.error("An error occurred during initialization:", err);
        current_weather.textContent = ("Failed to get location or weather data.", current_weather);
    }
}

// Manual refresh function for potential use
export async function refreshWeather() {
    try {
        showLoadingIndicator(current_weather);
        const locationInfo = await getLocation();
        const weatherInfo = await fetchWeather(locationInfo);
        
        if (weatherInfo && weatherInfo.current) {
            location = displayLocation(locationInfo.country, locationInfo.countryCode, locationInfo.city);
             current_weather.innerHTML = displayCurrentWeather(
                weatherInfo.current.temperature, 
                weatherInfo.current.condition, 
                weatherInfo.current.icon, 
                weatherInfo.time
            );
    
        }
    } catch (err) {
        console.error("Manual refresh failed:", err);
        current_weather.textContent = ("Failed to refresh weather data.", current_weather);
    }
}

// Auto-refresh functionality (optional)
export function startAutoRefresh(intervalMinutes) {
    setInterval(() => {
        if (!isWeatherDataFresh()) {
            console.log("Auto-refreshing weather data...");
            refreshWeather();
        }
    }, intervalMinutes * 60 * 1000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
    startAutoRefresh(60);
});