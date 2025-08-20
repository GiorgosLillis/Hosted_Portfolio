import {current_weather, location} from '../home/main.js';

export function displayLocation(country, countryCode, city){
    const locationMsg = `Greetings to the visitor from ${city}, ${country}!`;
    location.textContent = locationMsg ;
}

export function displayCurrentWeather(temperature, condition, icon, timestamp) {
    current_weather.innerHTML = `
        <div class="col-12 col-md-6 d-flex align-items-center justify-content-center py-1 mb-2 mb-md-0">
            <img src="${icon}" alt="${condition}" class="weather-icon me-3 py-1 px-0">
            <span class="mx-3">${condition}</span>
            <span class="ms-3">${temperature}°C</span>
        </div>

        <div class="col-12 col-md-6 py-1 ">
            <span>Last update: ${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `;
}

export function displayForecast(forecast) {
    const now = new Date();
    const currentHour = now.getHours();

    // Filter the hourly data to start from the current hour
    const futureHours = hourlyData.filter(hour => new Date(hour.timestamp).getHours() >= currentHour);
    
    let forecastHTML = '';
    futureHours.forEach(hour => {
        forecastHTML += `
            <div class="col-4 col-md-2 text-center p-3">
                <h4>${new Date(hour.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</h4>
                <img src="${hour.icon}" alt="${hour.condition}" class="img-fluid">
                <p>${hour.condition}</p>
                <p>${hour.temp}°C</p>
            </div>
        `;
    });
    forecastContainer.innerHTML = forecastHTML;
}

// Additional helper functions for UI
export function showLoadingIndicator() {
    current_weather.innerHTML = `<span id="loading">Loading...</span>`;
}

export function showError(message) {
    current_weather.innerHTML = `<span class="error">${message}</span>`;
}