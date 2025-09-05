My first attempt to host a website to a public domain

---

Tech stack I used:

### Frontend:

- HTML5
- CSS3
- Javascript ES2023
- Bootstrap 5

### Backend:

Before:

- Express.js

Now:

- Vercel serverless functions
---

### Features I have given:

- Clean, responsive design
- Contact form with email service
- reCAPTCHAv3 (Google), a CAPTCHA service that helps prevent spam by analyzing user interactions without requiring user input, ensuring a seamless user experience
- Three color modes switch
- Animated sections as they appear in view with AOS library
- Integration with reverse geolocation(https://opencagedata.com/) and Weather APIs(https://open-meteo.com/) for live weather data
- Weather data are saved in local storage for an hour
- Location Data are saved in local storage for 24 hours
- Accessibility tools including ARIA roles
- SEO optimizations such as meta tags and descriptive titles

---

### Contact Form

Submissions are sent directly to my email using Nodemailer. To avoid authentication issues and ensure security, my own email is being used to forward the user submitted emails.
You must set up a `.env` file in the `/server` folder to setup the same functionality. The file ought to store:

- Your designated email account
- An reCaptcha v3 key from [Google reCaptcha](https://cloud.google.com/security/products/recaptcha?hl=el)
- In case you wish to use an email account, it is required to enable 2FA and use an app passwords(not your account's password)

---

### Security

- Inputs are filtered and sanitized
- Email and API keys credentials are stored in `.env` and ignored by Git

---

### Shopping List App

- I have recently developed a simple shopping list
- You can add and delete items, reset the list, download the list as a text file and upload a text file
- It automatically numbers the items with the order they have been added

  Features to add (list.html):
- Drag-and-Drop Reordering: Allow users to reorder items in their list by dragging and dropping them.  ✅
- Quantity/Unit Input: Add fields for quantity (e.g., "2x Apples") and units (e.g., "kg", "g", "pcs") next to each item. ✅
- Categorization: Implement a way to categorize items (e.g., "Produce", "Dairy", "Meat") for easier shopping. ✅
- Persistence (Local Storage/Server): Ensure shopping lists are saved between sessions. Currently, it seems to rely on download/upload. ✅
- Local Storage: For a client-side solution, save lists to the user's browser's local storage. ✅
- Backend Database: For cross-device sync and more robust features, consider a simple backend to store user lists (e.g., using Firebase, Supabase, or a custom Node.js/Express API with a database).
- Sharing Functionality: Allow users to share their lists with others (e.g., via a unique URL or email if using a backend).
- Printable Version: Offer a clean, print-friendly version of the shopping list. ✅

---
 
### Weather Forecast

- For the purpose of deeper involvement with REST APIs and their data handling, an experimental weather forecast app will be developed.
- 7-days forecast with 3-hour steps 
- Accpents latitude and longitude, calls Open-Meteo API, maps the response according to weatherCodeMapping object 
  and returns current and forecast data on the combined weatherInfo object
- Weather icons from https://github.com/visualcrossing/WeatherIcons

  Features to add (weather.html):
-   Daily forecast with: ✅
    Min-Max Temperature ✅
    Weather conditions at noon ✅
    Sunrise and sunset times ✅

-   Detailed 3-hour forecast with:
    Day or night ✅
    Conditions ✅
    Temperature ✅
    Apparent temperature ✅
    Humidity ✅
    Wind direction and speed ✅
    UV index ✅ 
    Air quality ✅

-   Searching for cities:
    Search a city by name and optionally by country for more accurate results ✅
      Weather data for the searched city 
      Table look-up to find the needed country code 
      Searching with both fields empty defaults to the users location 
      Saving favorite cities
---

### Issues

- Any recommendation regarding fixes and improvments will be appreciated.

---

### Installation (Development)

```bash
git clone https://github.com/GiorgosLillis/Hosted_Portfolio.git
cd Hosted_Portfolio

# Make sure you have Node.js installed: https://nodejs.org/
npm install nodemailer axios dotenv

# Set up your own environment variables in .env file and in Vercel 

# Install Vercel CLI
npm install -g vercel

# Log in to Vercel
vercel login

# Run the project locally
npm run dev

```
