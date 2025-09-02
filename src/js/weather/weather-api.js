      // ------------ API CALLS ------------------------
const LOCATION_CACHE_KEY = 'LocationInfo';
export const WEATHER_CACHE_KEY = 'WeatherInfo';
const CITY_CACHE_KEY = 'CityInfo';

// Get location data from cache or API
export async function getLocation() {
    const cachedLocation = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY));
    const currentTime = new Date().getTime();
 
    if (cachedLocation && currentTime - cachedLocation.timestamp < 24 * 60 * 60 * 1000) {
      console.log("Location info is fresh and viable, using from localStorage");
      return cachedLocation;
    } 
    else {
      console.log("Location info is older than 24 hours or not found, fetching new data");
      let locationInfo = await callLocationAPI(null);
      return locationInfo;
    }
}

export async function getCityLocation(city, country) {

    const cachedCity =  JSON.parse(localStorage.getItem(CITY_CACHE_KEY));
    const currentTime = new Date().getTime();

    if(cachedCity && currentTime - cachedCity.timestamp < 24 * 60 * 60 * 1000 && cachedCity.city === city && cachedCity.country === country){
      console.log("City info is fresh and viable, using from localStorage");
      return cachedCity;
    }
    else{
      console.log("City info is older than 24 hours or not found, fetching new data");
      let cityInfo = await callLocationAPI(city, country);
      return cityInfo;
    }

}

// Fetch new location data
async function callLocationAPI(city, country) {
  try {
    // 1. Check if the user searches a city
 
    if(city){
      const res = await fetch(`/api/Forward_Location?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('City not found. Please check the spelling or try a different city.');
        }
        throw new Error(`Server returned an HTTP error: ${res.status}`);
      }

      const cityData = await res.json();
      if (!cityData) {
        throw new Error('City not found. Please check the spelling or try a different city.');
      }
      
      const cityInfo = {
              latitude: cityData.latitude,
              longitude: cityData.longitude,
              country: cityData.country_name,
              countryCode: cityData.country,
              city: city,
              timestamp: new Date().getTime(),
          };
      localStorage.setItem(CITY_CACHE_KEY, JSON.stringify(cityInfo));
      console.log("City data saved to localStorage");
      return cityInfo;
    }

    // 1. Check if not get the one he visits from
    const position = await getCurrentPositionPromise();
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
   
    
    // 3. Make the backend fetch call. This will fail if the server is unreachable.
    const res = await fetch(`/api/Reverse_Location?lat=${lat}&lon=${lon}`);
    
    // 4. Handle HTTP errors (e.g., 404, 500)
    if (!res.ok) {
      throw new Error(`Server returned an HTTP error: ${res.status}`);
    }
    
    // 5. Parse the data and check for validity.
    const locationData = await res.json();
    if (!locationData || !locationData.country || !locationData.city) {
      return false;
    }
    
    // 6. Return the data if all steps are successful.
    const locationInfo = {
            latitude: lat,
            longitude: lon,
            country: locationData.country_name,
            countryCode: locationData.country,
            city: locationData.city,
            timestamp: new Date().getTime(),
        };
        
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(locationInfo));
    console.log("Location data saved to localStorage");
    return locationInfo;
    
  } catch (err) {
    // Check for geolocation errors
    if (err.code) {
      switch (err.code) {
        case err.PERMISSION_DENIED:
          console.error("User denied the request for Geolocation.");
          break;
        case err.POSITION_UNAVAILABLE:
          console.error("Location information is unavailable.");
          break;
        case err.TIMEOUT:
          console.error("The request to get user location timed out.");
          break;
        default:
          console.error("An unknown geolocation error occurred.");
      }
      // Re-throw the error so it can be handled by the caller.
      throw new Error("Geolocation failed.");
    } else {
      // This is the crucial part: if the error doesn't have a `.code`, 
      // it's likely a network or server-side error.
      console.error(`🔴 Network or server error: ${err.message}`);
      throw new Error(`${err.message}`);
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
       if(!weatherData){
          return false;
       }

       const weatherInfo = {
            current: weatherData.current,
            hourly: weatherData.hourly,
            daily: weatherData.daily,
            time: Date.now(),
            city: locationInfo.city,
            country: locationInfo.country,
        };
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weatherInfo));
        console.log("Weather data saved to localStorage");
        return weatherInfo;
    } catch (err) {
        throw new Error("Error fetching weather:", err);
    }
}

// Get cached weather data
export function getCachedWeather() {
    if (isWeatherDataFresh()){
        const weather_temp = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
        const cachedLocation = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY));
        if(localStorage.getItem('searched-city') && weather_temp.city === localStorage.getItem('searched-city') ){
            return weather_temp;
        } 
        else if(cachedLocation && weather_temp.city === cachedLocation.city){
            return weather_temp;
        }
        return null;
    }
    return null;
}

// Check if weather data is fresh
export function isWeatherDataFresh() {
    const cachedWeather = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
    const currentTime = new Date().getTime();
    const HOUR_IN_MILLIS = 60 * 60 * 1000;
    
    return cachedWeather && (currentTime - cachedWeather.time < HOUR_IN_MILLIS);
}






     


