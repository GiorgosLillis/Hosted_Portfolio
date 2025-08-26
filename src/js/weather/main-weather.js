// main-weather.js - For vanilla JS pages
import { getLocation, fetchWeather, getCachedWeather, isWeatherDataFresh } from './weather-api.js';
import { 
    displayCity, 
    CurrentWeatherInfo, 
    displayForecast,
    displayDailyForecast,
    displayAirQuality,
    showError, 
    showLoadingIndicator, 
    setBackground
} from './display.js';

// DOM elements
export const LocationForecast = document.getElementById('location-forecast');
export const CurrentWeatherForecast = document.getElementById('current-weather-forecast');

export async function init() {
    const loadingElement = CurrentWeatherForecast || document.body;
    showLoadingIndicator(loadingElement);

    try {
        // Get location
        let locationInfo = await getLocation();
        
        // Check for fresh weather data
        let weatherInfo = getCachedWeather();
        
        if (weatherInfo) {
            console.log("Weather info is fresh, displaying from localStorage")
        } else {
            console.log("Weather info is older than 1 hour or not found, fetching new data");
            await fetchWeather(locationInfo);
            weatherInfo = getCachedWeather();
        }

        if (weatherInfo && weatherInfo.current) {
            // Display current weather
            setBackground(weatherInfo.current.img, CurrentWeatherForecast);
            displayCity(locationInfo.city);
            CurrentWeatherInfo(
                weatherInfo.current.temperature, 
                weatherInfo.current.condition, 
                weatherInfo.current.icon, 
                weatherInfo.time
            );
            
            // Display forecasts if containers exist
            if (weatherInfo.hourly) {
                displayForecast(weatherInfo.hourly);
            }
            
            if (weatherInfo.daily) {
                displayDailyForecast(weatherInfo.daily);
            }
            
            // Display air quality if available
            if (weatherInfo.airQuality) {
                displayAirQuality(weatherInfo.airQuality);
            }
            
        } else {
            showError("Weather data is not available.", loadingElement);
        }
    } catch (err) {
        console.error("An error occurred during initialization:", err);
        showError("Failed to get location or weather data.", loadingElement);
    }
}

// Auto-refresh functionality
export function startAutoRefresh(intervalMinutes) {
    setInterval(async () => {
        console.log("Auto-refreshing weather data...");
        refreshWeather();
    }, intervalMinutes * 60 * 1000);
}

// Manual refresh function
export async function refreshWeather() {
    try {
        const locationInfo = await getLocation();
        await fetchWeather(locationInfo);
        await init();
    } catch (err) {
        console.error("Manual refresh failed:", err);
        showError("Failed to refresh weather data.");
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
    startAutoRefresh(30);
});