// main-index.js
import { getLocation, fetchWeather, WEATHER_CACHE_KEY } from '/js/weather-api.js';
import { displayLocation, displayCurrentWeather, showLoadingIndicator, showError } from '/js/display.js';

export const current_weather = document.getElementById('current_weather');
export const location = document.getElementById('location');

const HOUR_IN_MILLIS = 60 * 60 * 1000;
async function init() {
    showLoadingIndicator(current_weather);

    try {
        let locationInfo = await getLocation();
        const cachedWeather = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
        const currentTime = new Date().getTime();

        if (cachedWeather && (currentTime - cachedWeather.time < HOUR_IN_MILLIS)) {
            console.log("Weather info is fresh, displaying from localStorage");
        } else {
            console.log("Weather info is older than 1 hour or not found, fetching new data");
            await fetchWeather(locationInfo);
        }

        const freshWeather = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
        if (freshWeather && freshWeather.current) {
            displayLocation(locationInfo.country, locationInfo.countryCode, locationInfo.city);
            displayCurrentWeather(freshWeather.current.temperature, freshWeather.current.condition, freshWeather.current.icon, freshWeather.time);
        } else {
            showError("Weather data is not available.", current_weather);
        }
    } catch (err) {
        console.error("An error occurred during initialization:", err);
        showError("Failed to get location or weather data.", current_weather);
    }
}

document.addEventListener('DOMContentLoaded', init);