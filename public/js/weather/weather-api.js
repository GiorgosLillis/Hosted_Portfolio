const weather = document.getElementById("weather");
weather.innerHTML = `
  <span id="loading">Loading weather</span>
`;
var country, coutryCode, city, temp, condition, icon; 



// 1. Check if weather info already exists in localStorage
const WEATHER_CACHE_KEY = 'WeatherInfo';
const LOCATION_CACHE_KEY = 'LocationInfo' 
const TWENTY_FOUR_HOURS_IN_MILLIS = 24 * 60 * 60 * 1000;
const HOUR_IN_MILLIS = 60 * 60 * 1000;


if(localStorage.getItem(WEATHER_CACHE_KEY)){
      console.log("Weather info found in localSrorage");
      const weatherinfo = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
      const currentTime = new Date().getTime();
      if (currentTime - weatherinfo.timestamp < HOUR_IN_MILLIS) {
        console.log("Weather info is fresh, displaying from localStorage");
        displayWeather(weatherinfo.country, weatherinfo.countryCode, weatherinfo.city, weatherinfo.temperature, weatherinfo.condition, weatherinfo.icon);
      }
      else{
        console.log("Weather info is older than 3 hours, fetching new data");
        getLocation();
      }
    }
    else{
        getLocation();
    } 
    

// 2. Check if location is saved
function getLocation() {

  if (localStorage.getItem(LOCATION_CACHE_KEY)) {
      const cachedLocation = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY));
      const currentTime = new Date().getTime();
      if (currentTime - cachedLocation.timestamp < TWENTY_FOUR_HOURS_IN_MILLIS) {
          console.log("Location info is fresh, using from localStorage");
          fetchWeather(cachedLocation.country_name, cachedLocation.country, cachedLocation.city);
      } else {
          console.log("Location info is older than 24 hours, fetching new data");
          callLocationAPI();
      }
  } else{
      console.log("No cached location info found, fetching new data");
      callLocationAPI();
  }
}

// 3. Fetch location and then weather
function callLocationAPI(){  
      fetch("/api/location")
        .then(res =>  {
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          return res.json();
        })
        .then(locationData => {
          if (!locationData || !locationData.country || !locationData.city || !locationData.country_name) {
              throw new Error("Invalid location data received from API.");
          }
          country = locationData.country_name;
          countryCode = locationData.country;
          city = locationData.city;

          const newLocationInfo = {
                    country_name: country,
                    country: countryCode,
                    city: city,
                    timestamp: new Date().getTime()
                };
          localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(newLocationInfo));
          console.log("Location data saved to localStorage");

          fetchWeather(country, countryCode, city);
        })
        .catch(err => {
                console.error("Error fetching location:", err);
                document.getElementById("weather").innerHTML = `
                    <span class="error">Unable to determine location. Weather data unavailable.</span>
                `;
            });
    }

function fetchWeather(country, countryCode, city) {
    fetch(`/api/weather?city=${encodeURIComponent(city)}&country=${encodeURIComponent(countryCode)}`)
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(weatherData => {
            // ... (your existing weatherData processing logic)
            temp = weatherData.main.temp;
            condition = weatherData.weather[0].description;
            icon = weatherData.weather[0].icon;

            displayWeather(country, countryCode, city, temp, condition, icon);
            let WeatherInfo = {
                country: country,
                countryCode: countryCode,
                city: city,
                temperature: temp,
                condition: condition,
                icon: icon,
                timestamp: new Date().getTime()
            }
            localStorage.setItem('WeatherInfo', JSON.stringify(WeatherInfo));
            console.log("Weather data saved to localStorage");
        })
        .catch(err => {
            console.error("Error fetching weather:", err);
            document.getElementById("weather").innerHTML = `
                <span class="error">Weather data unavailable for your location.</span>
            `;
        });
}

function displayWeather(country, countryCode, city, temperature, condition, icon) {
    const location = `Greetings to the visitor from ${city}, ${country}!`;
    document.getElementById("location").textContent = location;
    weather.innerHTML = `
        <img src="${icon}" alt="${condition}" class="weather-icon"> <span class="temperature">${temperature}°C</span>
        <span class="condition">${condition}</span>
      `;
}


