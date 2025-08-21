// ------------ API CALLS ------------------------
const LOCATION_CACHE_KEY = 'LocationInfo';
export const WEATHER_CACHE_KEY = 'WeatherInfo';

// Get location data from cache or API
export async function getLocation() {
    let locationInfo;
    const cachedLocation = JSON.parse(localStorage.getItem('LocationInfo'));
    const currentTime = new Date().getTime();

    if (cachedLocation && (currentTime - cachedLocation.timestamp < 24 * 60 * 60 * 1000)) {
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
        throw new Error ('Geolocation is not supported by this browser.');
    }

    try {
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
                throw new Error ('User denied the request for Geolocation.');
            case err.POSITION_UNAVAILABLE:
                throw new Error ('Location information is unavailable.');
            case err.TIMEOUT:
                throw new Error ('The request to get user location timed out.');
            default:
                throw new Error ('An unknown error occurred. Showing weather for a default location.');
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
export async function fetchWeather(locationInfo) {
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
        throw new Error("Error fetching weather:", err);
    }
}

