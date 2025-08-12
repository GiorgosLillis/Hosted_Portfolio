// ------------ GLOBAL VARIABLES ------------------------
const weather = document.getElementById("weather");
const locationEl = document.getElementById("location");

const WEATHER_CACHE_KEY = 'WeatherInfo';
const LOCATION_CACHE_KEY = 'LocationInfo';
const TWENTY_FOUR_HOURS_IN_MILLIS = 24 * 60 * 60 * 1000;
const HOUR_IN_MILLIS = 60 * 60 * 1000;

// ------------ MAIN INITIALIZATION FUNCTION ------------------------
async function init() {
    weather.innerHTML = `
      <span id="loading">Loading weather</span>
    `;

    try {
        let locationInfo = await getLocation();

        const cachedWeather = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
        const currentTime = new Date().getTime();

        if (cachedWeather && (currentTime - cachedWeather.timestamp < HOUR_IN_MILLIS)) {
            console.log("Weather info is fresh, displaying from localStorage");
            displayLocation(locationInfo.country, locationInfo.countryCode, locationInfo.city);
            displayWeather(cachedWeather.temperature, cachedWeather.condition, cachedWeather.icon);
        } else {
            console.log("Weather info is older than 1 hour or not found, fetching new data");
            await fetchWeather(locationInfo.city, locationInfo.countryCode);
        }
    } catch (err) {
        console.error("An error occurred during initialization:", err);
        weather.innerHTML += ` <br>
            <span class="error">Failed to get location or weather data.</span>
        `;
    }
}

// ------------ GET LOCATION DATA ------------------------
async function getLocation() {
    let locationInfo;
    const cachedLocation = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY));
    const currentTime = new Date().getTime();

    if (cachedLocation && (currentTime - cachedLocation.timestamp < TWENTY_FOUR_HOURS_IN_MILLIS)) {
        console.log("Location info is fresh, using from localStorage");
        return cachedLocation;
    } else {
        console.log("Location info is older than 24 hours or not found, fetching new data");
        locationInfo = await callLocationAPI();
        return locationInfo;
    }
}

// Fetch new location data
async function callLocationAPI() {
    let LocationInfo;
    
    if (!navigator.geolocation) {
        console.log("Geolocation is not supported by this browser.");
        weather.innerHTML = "Geolocation is not supported by this browser.";
        return;
    }

    try {
        weather.innerHTML = `<span id="loading">Getting your location...</span>`;
        
        const position = await getCurrentPositionPromise();
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        const res = await fetch(`/api/location?lat=${lat}&lon=${lon}`);
        const locationData = await res.json();
        
        if (!locationData || !locationData.country || !locationData.city) {
            throw new Error("Invalid reverse geocode data.");
        }
        
        LocationInfo = {
            country: locationData.country_name,
            countryCode: locationData.country,
            city: locationData.city,
            timestamp: new Date().getTime()
        };
        
        localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(LocationInfo));
        console.log("Location info saved to local storage");
        
        return LocationInfo;
    } catch (err) {
        // Robust error handling based on the GeolocationPositionError codes
        switch (err.code) {
            case err.PERMISSION_DENIED:
                console.error("User denied the request for Geolocation.");
                weather.innerHTML = `<span class="error">Location access denied. Showing weather for a default location.</span>`;
                break;
            case err.POSITION_UNAVAILABLE:
                console.error("Location information is unavailable.");
                weather.innerHTML = `<span class="error">Could not find your city. Showing weather for a default location.</span>`;
                break;
            case err.TIMEOUT:
                console.error("The request to get user location timed out.");
                weather.innerHTML = `<span class="error">Location request timed out. Showing weather for a default location.</span>`;
                break;
            default:
                console.error("An unknown error occurred during location retrieval:", err);
                weather.innerHTML = `<span class="error">An unknown error occurred. Showing weather for a default location.</span>`;
                break;
        }
    }
}

function getCurrentPositionPromise() {
    return new Promise((resolve, reject) => {
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
}
    
// Fetch new weather data
async function fetchWeather(city, countryCode) {
    try {
        const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}&country=${encodeURIComponent(countryCode)}`);
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const weatherData = await res.json();
        
        const temp = weatherData.main.temp;
        const condition = weatherData.weather[0].description;
        const icon = `https:${weatherData.weather[0].icon}`;
        
        const locationInfo = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY));
        displayLocation(locationInfo.country, locationInfo.countryCode, locationInfo.city);
        displayWeather(temp, condition, icon);
        
        const weatherInfo = {
            temperature: temp,
            condition: condition,
            icon: icon,
            timestamp: new Date().getTime()
        };
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weatherInfo));
        console.log("Weather data saved to localStorage");

    } catch (err) {
        console.error("Error fetching weather:", err);
        weather.innerHTML = `<span class="error">Weather data unavailable for your location.</span>`;
    }
}

// ---------------- DISPLAY RESULTS -------------
function displayLocation(country, countryCode, city){
    const location = `Greetings to the visitor from ${city}, ${country}!`;
    locationEl.textContent = location;
}

function displayWeather(temperature, condition, icon) {
    weather.innerHTML = `
        <img src="${icon}" alt="${condition}" class="weather-icon">
        <span class="temperature">${temperature}°C</span>
        <span class="condition">${condition}</span>
    `;
}

// Start the whole process
init();


