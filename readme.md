This was my first attempt to host a website to a public domain

---

Tech stack I used:

- Frontend
- HTML5
- CSS3
- Javascript
- Bootstrap 5

Backend:
- Node.js
- Express.js
- Nodemailer

---

Features I have given:

- Clean, responsive design with no template
- Contact form with email service 
- reCAPTCHA (Google) support to prevent spam
- Three color modes switch
- Animated sections as they appear in view with AOS library

---

Contact Form

Submissions are sent directly to my email using Nodemailer. To avoid authentication issues and ensure security, my own email is being used to send the user submitted emails.
You must set up a `.env` file in the `/server` folder to setup the same functionality. The file ought to store:
- Your designated email account
- In case you wish to use an email account, it is required to enable 2FA and use an app passwords(not your account's password)

---

Security

- Inputs are sanitized
- Email credentials are stored in `.env` and ignored by Git
- CORS properly configured for secure communication

---

Installation (Development)

```bash
git clone https://github.com/GiorgosLillis/Hosted_Portfolio.git
cd Hosted_Portfolio
npm install npm install express nodemailer dotenv cors body-parser nodemon
npm run start
