const weather = document.getElementById("weather");
weather.innerHTML = `
  <span id="loading">Loading weather</span>
`;
var country, coutryCode, city, temp, condition, icon; 

if(localStorage.getItem('WeatherInfo')){
  console.log("Weather info found in localSrorage");
  const weatherinfo = JSON.parse(localStorage.getItem('WeatherInfo'));
  const threeHoursInMillis = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
  const currentTime = new Date().getTime();
  if (currentTime - weatherinfo.timestamp > threeHoursInMillis) {
    console.log("Weather info is older than 3 hours, fetching new data");
    getWeather();
  }
  else{
    console.log("Weather info is fresh, displaying from localStorage");
    displayWeather(weatherinfo.country, weatherinfo.countryCode, weatherinfo.city, weatherinfo.temperature, weatherinfo.condition, weatherinfo.icon);
  }
}
else{
    getWeather();
} 

function getWeather() {
  fetch("https://ipapi.co/json/")
    .then(res => res.json())
    .then(locationData => {
      country = locationData.country_name || "your country";
      countryCode = locationData.country || "your country code";
      city = locationData.city || "your city";
      return fetch(`/api/weather?city=${encodeURIComponent(city)}&country=${encodeURIComponent(countryCode)}`);
    })
    .then(res => res.json())
    .then(weatherData => {
      temp = weatherData.main.temp;
      condition = weatherData.weather[0].description;
      icon = weatherData.weather[0].icon;

      displayWeather(country, countryCode, city, temp, condition, icon);
      WeatherInfo = {
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
      console.error("Error:", err);
      document.getElementById("weather").innerHTML = `
        <span class="error">Weather data unavailable</span>
      `;
    });
}

function displayWeather(country, countryCode, city, temperature, condition, icon) {
    const location = `Greetings to the visitor from ${city}, ${country}!`;
    document.getElementById("location").textContent = location;
    weather.innerHTML = `
        <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${condition}" />
        <strong>${temperature}°C</strong> — ${condition}
      `;
}


