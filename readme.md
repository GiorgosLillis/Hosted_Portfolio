My first attempt to host a website to a public domain

---

Tech stack I used:

### Frontend:

- HTML5
- CSS3
- Javascript ES2023
- React (weather forecast and profile/account pages)
- Bootstrap 5
- i18next / react-i18next (English and Greek)

### Backend:

Before:

- Express.js

Now:

- Vercel serverless functions
- Prisma ORM with PostgreSQL (Neon)
- Upstash Redis (rate limiting, caching, sessions)
- web-push (Web Push API / VAPID) for daily weather notifications

---

### Features I have given:

- Clean, responsive design
- Contact form with email service
- reCAPTCHAv3 (Google), a CAPTCHA service that helps prevent spam by analyzing user interactions without requiring user input, ensuring a seamless user experience
- Three color modes switch
- Animated sections as they appear in view with AOS library
- Integration with geocoding ([OpenStreetMap Nominatim](https://nominatim.org/)) and weather ([Open-Meteo](https://open-meteo.com/)) APIs for live weather data
- Weather data are saved in local storage for an hour
- Location Data are saved in local storage for 24 hours
- A full account system with registration, login, password reset, editing and deletion
- "Log out everywhere" support, invalidates all other active sessions
- Rate limiting on sensitive endpoints, backed by Redis
- Automated test suite covering every API endpoint and key client-side logic (Vitest)
- Accessibility tools including ARIA roles, keyboard navigation and focus management
- SEO optimizations such as meta tags and descriptive titles
- Every outgoing fetch (client-side, and server-side calls to upstream weather/geocoding APIs) is bounded by a timeout, so a hung request fails cleanly instead of hanging the UI forever
- Offline page, shown instead of the browser's error when a page can't be loaded without a connection
- The home, list, profile and password reset pages are available in English and Greek. The weather forecast page uses the same language switch, place names are looked up in the active language, and the daily push notification is written in the language chosen when subscribing (it updates when you switch language). The language is picked from the switcher, then remembered (`site-lang` in local storage), then the browser language, then English
- Translation files live in `src/i18n/` (`en.json` is the full set, `el.json` holds the Greek translations). A key missing from `el.json` falls back to English. API responses carry a stable `code` (set through the `sendStatus` helper) next to the English message, and the client translates it through the `api-<code>` keys

---

### Contact Form

Submissions are sent to my inbox with Nodemailer through [Brevo](https://www.brevo.com/)'s SMTP relay, as do the account emails (password resets, security notices). They are sent from an address on the site's own domain, which is authenticated with DKIM, SPF and DMARC records, so they reach the inbox and the domain can't easily be spoofed. The visitor's address is set as reply-to.

---

### Security

In order to ensure system security and integrity hte following measures have been implemented:

- Inputs are filtered and sanitized
- Email and API keys credentials are stored in `.env` and ignored by Git
- Passwords are hashed with bcrypt, never stored in plain text
- Email addresses are verified: a new account (or a changed email) only works once the emailed single-use link is clicked, throwaway domains and domains that can't receive mail are rejected at sign-up, and unconfirmed sign-ups are deleted after 2 days
- Sessions are JWTs in httpOnly cookies, with a tokenVersion check so "log out everywhere" actually invalidates old sessions instead of just clearing a cookie
- Rate limiting by IP and by account on every sensitive or mutating endpoint
- Push subscriptions are only accepted from the browsers' own push services (an allowlist of hosts), because the server later sends requests to that address
- The Redis session cache never holds the password hash, and it is cleared whenever the account is edited or deleted
- The API enforces the same size and type limits as the forms (list items, cities, city labels), since anyone can call it directly
- Emails are stored and looked up in lowercase, session tokens are pinned to HS256, the cron endpoints (`notify`, `keep-alive`) compare their secret in constant time, and API responses default to `Cache-Control: no-store`
- Shopping list item names are limited to letters, numbers, spaces and a few punctuation marks, checked in the browser and again by the API. A downloaded CSV escapes cells that a spreadsheet would run as formulas ("CSV injection")
- Pages only allow the site's own origin in `Access-Control-Allow-Origin` (the API sets its own, with credentials), can't be framed by other sites (`frame-ancestors 'self'`), and send HSTS
- A Content-Security-Policy header (set in `vercel.json`) that only allows scripts, styles, fonts, images and connections from the site itself and the few CDNs and Google reCAPTCHA hosts it uses. Inline scripts are blocked, so there are no inline event handlers (the theme buttons use `data-theme`), and the offline page's one inline `<style>` and `<script>` are allowed by SHA-256 hash. If you edit either block in `public/offline.html`, regenerate its hash in the policy, and bump the cache name in `public/sw.js` so visitors don't keep the old copy

You must set up a `.env` file in project root. The file ought to store:

- Brevo SMTP credentials and the mail addresses: `BREVO_SMTP_LOGIN` and `BREVO_SMTP_KEY` (an SMTP key from Brevo's SMTP & API page, not an API key), `MAIL_FROM` (a sender on a domain you authenticated in Brevo) and `CONTACT_TO` (where contact-form messages arrive)
- An reCaptcha v3 key from [Google reCaptcha](https://cloud.google.com/security/products/recaptcha?hl=el)
- A PostgreSQL connection string (I use [Neon](https://neon.tech/))
- Upstash Redis credentials
- VAPID keys for Web Push notifications: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a `mailto:` address or URL identifying you, per the Web Push spec). Generate the key pair with `npx web-push generate-vapid-keys`
- A `CRON_SECRET` value (any random string) that Vercel automatically sends as a bearer token on cron-triggered requests, so the notification endpoint can verify the call actually came from Vercel's scheduler and not a random request

Make sure to also add these same variables to your Vercel project's Environment Variables settings (Project Settings → Environment Variables), otherwise the deployed site won't have access to them even if your local `.env` works.

---

### Shopping List

- I have recently developed a simple shopping list
- You can add and delete items, reset the list, download the list as a CSV file (opens in Excel or LibreOffice, Greek included) and upload a CSV file to add its items to the list
- It automatically numbers the items with the order they have been added

  Features to add (list.html):

- Drag-and-Drop Reordering: Allow users to reorder items in their list by dragging and dropping them. ✅
- Quantity/Unit Input: Add fields for quantity (e.g., "2x Apples") and units (e.g., "kg", "g", "pcs") next to each item. ✅
- Categorization: Implement a way to categorize items (e.g., "Produce", "Dairy", "Meat") for easier shopping. ✅
- Persistence (Local Storage/Server): Ensure shopping lists are saved between sessions. Currently, it seems to rely on download/upload. ✅
- Local Storage: For a client-side solution, save lists to the user's browser's local storage. ✅
- Backend Database: For cross-device sync and more robust features, consider a simple backend to store user lists.
- Now available: Logged-in users get their list stored to their account and synced across devices. ✅
- Sharing Functionality: Allow users to share their lists with others (e.g., via a unique URL or email if using a backend).
- Printable Version: Offer a clean, print-friendly version of the shopping list. ✅
- Items can be reordered by keyboard (move up/down buttons) as well as drag-and-drop ✅

---

### Weather Forecast

- For the purpose of deeper involvement with REST APIs and their data handling, an experimental weather forecast app will be developed.
- 7-days forecast with detailed hourly forecast
- Accepts latitude and longitude, calls Open-Meteo API, maps the response according to weatherCodeMapping object
  and returns current and forecast data on the combined weatherInfo object
- Weather icons from https://github.com/visualcrossing/WeatherIcons
- City/country search and reverse geolocation are powered by OpenStreetMap's Nominatim API

  Features to add (weather.html):

- Daily forecast with:
  Min-Max Temperature ✅
  Weather conditions at noon ✅
  Sunrise and sunset times ✅

- Detailed hourly forecast with:
  Day or night ✅
  Conditions ✅
  Temperature ✅
  Apparent temperature ✅
  Humidity ✅
  Wind direction and speed ✅
  UV index ✅
  Air quality ✅

- Searching for cities:
  Search a city by name and optionally by state/region and country for more accurate results (the region tells apart places that share a name) ✅
  Weather data for the searched city ✅
  Country code and name resolved automatically via Nominatim ✅
  Searching with both fields empty defaults to the users location ✅
  The region is shown next to the city in the header, the favorites and the recent searches ✅
  Saving favorite cities, identified by their coordinates so two places with the same name can both be saved, each with a delete button in the favorites panel ✅
  Recently searched cities (last 5, newest first, with the time of the search) in a side panel next to the hour details, stored on the device, with a "Clear all" button. The panel and the hour details never open at the same time ✅

- Daily notification (browser push, via a Service Worker + the Web Push API):
  Sends a summary of tomorrow's forecast once a day, at an hour of your choosing
  Not tied to your account, subscribing is anonymous and per-browser/device, so it works the same whether you're logged in or not
  Vercel's Hobby plan only lets a single cron job fire once a day, so instead of one daily cron there are 24 separate hourly cron entries in vercel.json, each checking only the subscriptions that picked that hour
  Dead or expired subscriptions are pruned automatically once the push service reports them gone
  The notification text (title, body and button labels) is built on the server in the language stored with each subscription (`lang` column, English or Greek), and the service worker only displays it. Switching the site language calls `/api/update-language`, which changes only the language of the existing subscription, so alerts follow the language without being recreated
  Requires HTTPS (or localhost) and notification permission; on iOS Safari it only works if the site has been added to the home screen

---

### Profile / Account System

- Register and log in with email/password, sessions kept in httpOnly cookies
- New accounts confirm their email address through an emailed single-use link before they can log in. Logging in unconfirmed sends a fresh link (at most one every 10 minutes), and there is a "resend" button. Unconfirmed sign-ups are deleted after 2 days
- Edit your account details and password. A new email address only replaces the old one once the link sent to it is clicked, and the old address is told
- Forgot password flow, sends a single-use reset link by email (a completed reset also confirms the email)
- "Log out everywhere" button, invalidates every other active session
- Delete your account, confirmed by a link emailed to the account (valid for an hour)
- Export your account data (favorite cities and shopping list) as JSON or CSV
- Favorites and shopping list are synced to your account when logged in, kept local-only otherwise, and never mixed between the two. A save replaces what is stored with exactly what is on screen
- All emails are sent through Brevo from the site's own domain

---

### Installable App (PWA)

- The weather forecast and profile pages can be installed as a standalone app (desktop or mobile) straight from the browser's own install option
- Only supported on Chromium-based browsers (Chrome, Edge, Samsung Internet). Safari/iOS has no equivalent install prompt, and desktop Firefox dropped PWA install support entirely

---

### Testing

- Automated test suite built with Vitest
- Covers every API endpoint (auth, rate limiting, edge cases) and the key client-side storage/sync logic
- Runs automatically before every build

### Issues

- Any recommendation regarding fixes and improvments will be appreciated.

---

### Installation (Development)

```bash
git clone https://github.com/GiorgosLillis/Hosted_Portfolio.git
cd Hosted_Portfolio

# Install all dependencies
npm install

# Install Vercel CLI
npm install -g vercel

# Log in to Vercel
vercel login

# Set up your .env file (see Contact Form section above for what it needs)

# Run the test suite (optional, already on project build flow)
npm test

# Run the project locally
vercel dev


# To test on your phone over the same WiFi network (HTTPS is required for geolocation to work off-localhost):

# 1. Run the API separately on its own port
vercel dev --listen 3001

# 2. Run the frontend with Vite instead (HTTPS + LAN-accessible, proxies /api/* to the vercel dev instance above)
npm run dev

# Then browse to https://<your-PC's-LAN-IP>:3000 from your phone, accepting the self-signed certificate warning once
```
