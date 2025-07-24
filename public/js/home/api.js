document.getElementById("weather").innerHTML = `
  <span id="loading">Loading weather</span>
`;

fetch("https://ipapi.co/json/")
  .then(res => res.json())
  .then(locationData => {
    const country = locationData.country_name || "your country";
    const countryCode = locationData.country || "your country code";
    const city = locationData.city || "your city";
    
    const location = `Greetings to the visitor from ${city}, ${country}!`;
    document.getElementById("location").textContent = location;

    return fetch(`/api/weather?city=${encodeURIComponent(city)}&country=${encodeURIComponent(countryCode)}`);
  })
  .then(res => res.json())
  .then(weatherData => {
    const temp = weatherData.main.temp;
    const condition = weatherData.weather[0].description;
    const icon = weatherData.weather[0].icon;

    document.getElementById("weather").innerHTML = `
      <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${condition}" />
      <strong>${temp}°C</strong> — ${condition}
    `;
  })
   .catch(err => {
    console.error("Error:", err);
    document.getElementById("weather").innerHTML = `
      <span class="error">Weather data unavailable</span>
    `;
  });

