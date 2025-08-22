// main-weather.js
import { getLocation, fetchWeather, WEATHER_CACHE_KEY } from './weather-api.js';
import { displayCity, CurrentWeatherInfo, showError, showLoadingIndicator, setBackground } from './display.js';

export const LocationForecast = document.getElementById('location-forecast');
export const CurrentWeatherForecast = document.getElementById('current-weather-forecast');

const HOUR_IN_MILLIS = 60 * 60 * 1000;

async function init() {
    showLoadingIndicator(CurrentWeatherForecast);

    try {
        let locationInfo = await getLocation();

        const cachedWeather = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
        const currentTime = new Date().getTime();
        
        if (cachedWeather && (currentTime - cachedWeather.timestamp < HOUR_IN_MILLIS)) {
            console.log("Weather info is fresh, displaying from localStorage");
        } else {
            console.log("Weather info is older than 1 hour or not found, fetching new data");
            await fetchWeather(locationInfo);
        }

        const freshWeather = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
         if (freshWeather && freshWeather.current) {
            setBackground(freshWeather.current.img, CurrentWeatherForecast);
            displayCity(locationInfo.city);
            CurrentWeatherInfo(freshWeather.current.temperature, freshWeather.current.condition, freshWeather.current.icon, freshWeather.timestamp, freshWeather.current.img );
        } else {
            showError("Weather data is not available.", CurrentWeatherForecast);
        }
    } catch (err) {
        console.error("An error occurred during initialization:", err);
        showError("Failed to get location or weather data.", CurrentWeatherForecast);
    }
}

document.addEventListener('DOMContentLoaded', init);
