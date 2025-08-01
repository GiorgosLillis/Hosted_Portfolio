This was my first attempt to host a website to a public domain

---

Tech stack I used:

### Frontend:

- HTML5
- CSS3
- Javascript ES2023
- Bootstrap 5

### Backend:

Before:

- Node.js
- Express.js
- Nodemailer

Now:

- +Vercel serverless functions

---

### Features I have given:

- Clean, responsive design
- Contact form with email service
- reCAPTCHAv3 (Google), a CAPTCHA service that helps prevent spam by analyzing user interactions without requiring user input, ensuring a seamless user experience
- Three color modes switch
- Animated sections as they appear in view with AOS library
- Integration with browser geolocation(https://opencagedata.com/) and Weather APIs(https://www.weatherapi.com/) for live weather data
- Weather data are saved in local storage for an hour
- Accessibility tools including ARIA roles
- SEO optimizations such as meta tags and descriptive titles

---

### Contact Form

Submissions are sent directly to my email using Nodemailer. To avoid authentication issues and ensure security, my own email is being used to forward the user submitted emails.
You must set up a `.env` file in the `/server` folder to setup the same functionality. The file ought to store:

- Your designated email account
- An reCaptcha v3 key from [Google reCaptcha](https://cloud.google.com/security/products/recaptcha?hl=el)
- An weather api key from [OpenWeather]https://home.openweathermap.org/api_keys
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

  Features to add (List.html):
- Drag-and-Drop Reordering: Allow users to reorder items in their list by dragging and dropping them.  ✅
- Quantity/Unit Input: Add fields for quantity (e.g., "2x Apples") and units (e.g., "kg", "g", "pcs") next to each item. ✅
- Categorization: Implement a way to categorize items (e.g., "Produce", "Dairy", "Meat") for easier shopping. ✅
- Persistence (Local Storage/Server): Ensure shopping lists are saved between sessions. Currently, it seems to rely on download/upload.
- Local Storage: For a client-side solution, save lists to the user's browser's local storage. ✅
- Backend Database: For cross-device sync and more robust features, consider a simple backend to store user lists (e.g., using Firebase, Supabase, or a custom Node.js/Express API with a database).
- Sharing Functionality: Allow users to share their lists with others (e.g., via a unique URL or email if using a backend).
- Printable Version: Offer a clean, print-friendly version of the shopping list. ✅

---
 
### Weather Forecast

- For the purpose of deeper involvement with REST APIs and their data handling, an experimental weather forecast app will be developed.

---

### Issues

- Any recommendation regarding fixes and improvments will be appreciated.

---

### Installation (Development)

```bash
git clone https://github.com/GiorgosLillis/Hosted_Portfolio.git
cd Hosted_Portfolio
npm install nodemailer axios dotenv

# Set up your own environment variables in .env file and in Vercel 

# Install Vercel CLI
npm install -g vercel

# Log in to Vercel
vercel login

# Run the project locally
vercel dev

```
