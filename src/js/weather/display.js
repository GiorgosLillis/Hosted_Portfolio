// DOM element getters - safe for both React and vanilla JS
const getElement = (id) => document.getElementById(id);

// Background utilities
export function setBackground(img, target) {
    if (target && target.id !== 'current_weather') {
        document.body.style.backgroundImage = `url('${img}')`;
    }
}

// Location display functions
export function displayLocation(country, city) {
    const locationMsg = `Greetings to the visitor from ${city}, ${country}!`;
    return locationMsg;
}


// Current weather display functions
export function displayCurrentWeather(temperature, condition, icon, time) {

    
    const weatherMsg = `
        <div class="col-12 col-md-6 d-flex align-items-center justify-content-center py-1 mb-2 mb-md-0">
            <img src="${icon}" alt="${condition}" class="weather-icon me-3 py-1 px-0">
            <span class="mx-3">${condition}</span>
            <span class="ms-3">${temperature}°C</span>
        </div>
        <div class="col-12 col-md-6 py-1">
            <span>Last update: ${new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `;
    return weatherMsg;
}


// Forecast display functions
export function displayForecast(hourlyData) {
    const forecastContainer = getElement('forecast-container');
    if (!forecastContainer || !hourlyData) {
        console.log('Forecast cannot be displayed!');
        showError('Forecast cannot be displayed!');
        return;
    }
    
    const now = new Date();
    const currentHour = now.getHours();

    // Filter the hourly data to start from the current hour
    const futureHours = hourlyData.filter(hour => 
        new Date(hour.timestamp).getHours() >= currentHour
    );

    let forecastHTML = '';
    futureHours.forEach(hour => {
        forecastHTML += `
            <div class="col-4 col-md-2 text-center p-3">
                <h4>${new Date(hour.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</h4>
                <img src="${hour.icon}" alt="${hour.condition}" class="img-fluid">
                <p>${hour.condition}</p>
                <p>${hour.temperature}°C</p>
            </div>
        `;
    });
    return forecastHTML;
}

// Daily forecast display
export function displayDailyForecast(dailyData) {
    const dailyContainer = getElement('daily-forecast-container');
    if (!dailyContainer || !dailyData) {
        console.log('Daily forecast cannot be displayed!');
        return;
    }
    
    let dailyHTML = '';
    dailyData.forEach(day => {
        dailyHTML += `
            <div class="daily-item row py-2 border-bottom">
                <div class="col-4">
                    <span>${new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                </div>
                <div class="col-4 text-center">
                    <img src="${day.icon}" alt="${day.condition}" class="weather-icon-small">
                    <span class="ms-2">${day.condition}</span>
                </div>
                <div class="col-4 text-end">
                    <span class="high-temp fw-bold">${day.maxTemperature}°</span>
                    <span class="low-temp text-muted ms-2">${day.minTemperature}°</span>
                </div>
            </div>
        `;
    });
    return dailyHTML;
}

// Air quality display
export function displayAirQuality(airQualityData) {
    const airQualityContainer = getElement('air-quality-container');
    if (!airQualityContainer) return;
    
    if (!airQualityData) {
        airQualityContainer.innerHTML = '<p class="text-muted">Air quality data not available</p>';
        return;
    }
    
    const { pm10, pm2_5, carbonMonoxide, nitrogenDioxide, ozone, sulphurDioxide } = airQualityData;
    
    airQualityContainer.innerHTML = `
        <div class="air-quality-grid">
            ${pm10 !== null ? `<div class="air-quality-item"><span class="label">PM10:</span> <span class="value">${pm10} μg/m³</span></div>` : ''}
            ${pm2_5 !== null ? `<div class="air-quality-item"><span class="label">PM2.5:</span> <span class="value">${pm2_5} μg/m³</span></div>` : ''}
            ${carbonMonoxide !== null ? `<div class="air-quality-item"><span class="label">CO:</span> <span class="value">${carbonMonoxide} μg/m³</span></div>` : ''}
            ${nitrogenDioxide !== null ? `<div class="air-quality-item"><span class="label">NO₂:</span> <span class="value">${nitrogenDioxide} μg/m³</span></div>` : ''}
            ${ozone !== null ? `<div class="air-quality-item"><span class="label">O₃:</span> <span class="value">${ozone} μg/m³</span></div>` : ''}
            ${sulphurDioxide !== null ? `<div class="air-quality-item"><span class="label">SO₂:</span> <span class="value">${sulphurDioxide} μg/m³</span></div>` : ''}
        </div>
    `;
}

// UI helper functions
export function showLoadingIndicator() {
    const loading = `<div class="loading-spinner"><span>Loading...</span></div>`;
    return loading;
    
}

export function showError(message) {
    error = `<div class="error-message alert alert-danger">${message}</div>`;
    console.error(message);
    return error;
}

// React-compatible data formatters (pure functions that don't touch DOM)
export const formatters = {
    temperature: (temp) => `${temp}°C`,
    time: (timestamp) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    airQualityLevel: (pm25) => {
        if (pm25 <= 12) return { level: 'Good', class: 'good' };
        if (pm25 <= 35) return { level: 'Moderate', class: 'moderate' };
        if (pm25 <= 55) return { level: 'Unhealthy for Sensitive Groups', class: 'unhealthy-sensitive' };
        if (pm25 <= 150) return { level: 'Unhealthy', class: 'unhealthy' };
        return { level: 'Very Unhealthy', class: 'very-unhealthy' };
    }
};

// Weather condition mapping helper
export function getWeatherIcon(condition, isDay) {
    const iconBase = '/assets/weather-icons/';
    const timeOfDay = isDay ? 'day' : 'night';
    
    const iconMap = {
        'Clear': `${iconBase}clear-${timeOfDay}.svg`,
        'Partly cloudy': `${iconBase}partly-cloudy-${timeOfDay}.svg`,
        'Cloudy': `${iconBase}cloudy.svg`,
        'Overcast': `${iconBase}overcast.svg`,
        'Rain': `${iconBase}rain.svg`,
        'Heavy rain': `${iconBase}heavy-rain.svg`,
        'Snow': `${iconBase}snow.svg`,
        'Thunderstorm': `${iconBase}thunderstorm.svg`,
    };
    
    return iconMap[condition] || `${iconBase}default.svg`;
}