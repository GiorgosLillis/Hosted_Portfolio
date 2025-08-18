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
        
        if (cachedWeather && (currentTime - cachedWeather.current.timestamp < HOUR_IN_MILLIS)) {
            console.log("Weather info is fresh, displaying from localStorage");
        } else {
            console.log("Weather info is older than 1 hour or not found, fetching new data");
            await fetchWeather(locationInfo);
        }

        const freshWeather = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
         if (freshWeather && freshWeather.current) {
            displayLocation(locationInfo.country, locationInfo.countryCode, locationInfo.city);
            console.log(freshWeather.current.temperature, freshWeather.current.condition, freshWeather.current.icon);
            displayCurrentWeather(freshWeather.current.temperature, freshWeather.current.condition, freshWeather.current.icon);
        } else {
            weather.innerHTML = `<span class="error">Weather data is not available.</span>`;
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
            latitude: lat,
            longitude: lon,
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
async function fetchWeather(locationInfo) {
    try {
        
        const res = await fetch(`/api/weather?lat=${encodeURIComponent(locationInfo.latitude)}&lon=${encodeURIComponent(locationInfo.longitude)}`);

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
       const weatherData = await res.json();
       const weatherInfo = {
            current: weatherData.current,
            hourly: weatherData.hourly,
            daily: weatherData.daily,
            timestamp: new Date().getTime(),
            city: locationInfo.city,
            country: locationInfo.country,
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

function displayCurrentWeather(temperature, condition, icon) {
    weather.innerHTML = `
        <img src="${icon}" alt="${condition}" class="weather-icon mx-3">
        <span class="condition mx-3">${condition}</span>
        <span class="temperature mx-3">${temperature}°C</span>
    `;
}

function displayForecast(forecast) {
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
// Start the whole process
init();


