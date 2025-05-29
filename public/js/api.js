const apiKey = "a1694888404d51c78d69d8c170e489a5";

fetch("https://ipapi.co/json/")
  .then(res => res.json())
  .then(locationData => {
    const country = locationData.country_name || "your country";
    const countryCode = locationData.country || "your country code";
    const city = locationData.city || "your city";
    
    const location = `Greetings to the visitor from ${city}, ${country}!`;
    document.getElementById("location").textContent = location;

    return fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city},${countryCode}&units=metric&appid=${apiKey}`);
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
  .catch(err => console.error("Error:", err));

