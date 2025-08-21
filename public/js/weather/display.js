const current_weather = document.getElementById('current_weather');
const location = document.getElementById('location');
const LocationForecast = document.getElementById('location-forecast');
const CurrentWeatherForecast = document.getElementById('current-weather-forecast');

export function setBackground(img, target) {
    if (target && target.id != 'current_weather') {
        document.body.style.backgroundImage = `url('${img}')`;
    }
}

export function displayLocation(country, countryCode, city) {
    if (!location) {
        return;
    }
    const locationMsg = `Greetings to the visitor from ${city}, ${country}!`;
    location.textContent = locationMsg;
}

export function displayCity(city) {
    if (!LocationForecast) {
        return;
    }
    LocationForecast.textContent = '';
    LocationForecast.textContent = city;
}

export function displayCurrentWeather(temperature, condition, icon, timestamp) {
    if (!current_weather) {
        console.log('Current weather cannot be displayed!');
        showError('Current weather cannot be displayed!');
        return;
    }
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

export function CurrentWeatherInfo(temperature, condition, icon, timestamp) {
    if (!CurrentWeatherForecast) {
        console.log('Current weather cannot be displayed!');
        showError('Current weather cannot be displayed!');
        return;
    }
    CurrentWeatherForecast.innerHTML = `
        <div class="col-12">
              <h1 class="display-2">${temperature}°C</h1>
        </div>
        <div class="col-12 d-flex align-items-center justify-content-center py-1 mb-2">
            <img src="${icon}" alt="${condition}" class="weather-icon me-3 py-1 px-0">
            <span class="mx-3">${condition}</span>
        </div>
        <div class="col-12">
            <span>Last update: ${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `;
}

export function displayForecast(forecast) {
    if (!forecast) {
        console.log('Forecast cannot be displayed!');
        showError('Forecast cannot be displayed!');
        return;
    }
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
// display.js
export function showLoadingIndicator(targetElement) {
    if (targetElement) {
        targetElement.innerHTML = `<span id="loading">Loading...</span>`;
    }
}

export function showError(message, targetElement) {
    if (targetElement) {
        targetElement.innerHTML = `<span class="error">${message}</span>`;
    }
}