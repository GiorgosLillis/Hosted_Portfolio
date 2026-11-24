// main-index.js - Refactored to use new API functions
import { getLocation, fetchWeather, getCachedWeather } from '../weather/weather-api.js';
import { localName, translatePlaces, PLACE_NAMES_EVENT } from '../weather/place-names.js';
import i18next, { conditionLabel } from '../common/i18n.js';

export const current_weather = document.getElementById('current_weather');
export const location = document.getElementById('location');


let loaded = null;

function createElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) {
        el.className = className;
    }
    if (text !== undefined) {
        el.textContent = text;
    }
    return el;
}

function buildCurrentWeather(temperature, condition, icon, time) {
    const fragment = document.createDocumentFragment();

    const current = createElement('div', 'col-12 col-md-6 d-flex align-items-center justify-content-center py-1 mb-2 mb-md-0');
    const img = createElement('img', 'weather-icon me-3 py-1 px-0');
    img.src = icon;
    img.alt = condition;
    current.append(img, createElement('span', 'mx-3', condition), createElement('span', 'ms-3', `${temperature}°C`));

    const updated = createElement('div', 'col-12 col-md-6 py-1');
    const timeText = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    updated.append(createElement('span', '', i18next.t('last-update', { time: timeText })));

    fragment.append(current, updated);
    return fragment;
}

function render() {
    if (!loaded) {
        return;
    }
    const { locationInfo, weatherInfo } = loaded;
    if (weatherInfo && weatherInfo.current) {
        location.textContent = i18next.t('home-greeting', localName(locationInfo));
        current_weather.replaceChildren(buildCurrentWeather(
            weatherInfo.current.temperature,
            conditionLabel(weatherInfo.current.code, weatherInfo.current.condition),
            weatherInfo.current.icon,
            weatherInfo.time
        ));
    } else {
        current_weather.textContent = i18next.t('weather-unavailable');
    }
}

// Small weather teaser shown on the home page, uses the same API client as the full weather page
async function init() {
    try {
        const locationInfo = await getLocation();
        let weatherInfo = getCachedWeather(locationInfo);
        if (weatherInfo) {
            console.log("Weather info is fresh, displaying from localStorage");
        } else {
            console.log("Weather info is older than 1 hour or not found, fetching new data");
            weatherInfo = await fetchWeather(locationInfo);
        }

        loaded = { locationInfo, weatherInfo };
        render();
        translatePlaces([locationInfo]);
    } catch (err) {
        console.error("An error occurred during initialization:", err);
        current_weather.textContent = err.message;
    } finally {
        location.removeAttribute('data-i18n');
        current_weather.removeAttribute('data-i18n-html');
    }
}

// Shows the translated text right away, the place name follows once its translation is known
i18next.on('languageChanged', () => {
    render();
    if (loaded) {
        translatePlaces([loaded.locationInfo]);
    }
});
window.addEventListener(PLACE_NAMES_EVENT, render);

document.addEventListener('DOMContentLoaded', () => {
    init();
});
