require('dotenv').config();
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');

const express = require('express');
const path = require('path');
const app = express();  

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_ID,
    pass: process.env.EMAIL_PASSWORD,
  },
});

transporter.verify((error) => {
  if (error) {
    console.error('SMTP Connection Error:', error);
  } else {
    console.log('Server is ready to send emails');
  } 
});

app.post("/send-email", async (req, res) => {
    const { email, subject, message, recaptchaToken} = req.body;

    if (!recaptchaToken) {
      return res.status(400).json({ message: "Captcha required" });
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    try {
      const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`;
      const { data } = await axios.post(verifyURL);

      if (!data.success) {
        return res.status(403).json({ message: "Captcha verification failed" });
      }

      
      if (!email || !subject || !message) {
        return res.status(400).json({ message: 'Missing required fields' });
    }


    const mailOptions = {
      from: `"Contact Form" <${process.env.EMAIL_ID}>`,
      to: process.env.EMAIL_ID,
      subject: `[Contact Form] ${subject}`,
      text: `From: ${email}\n\n${message}`,
      html: `<p><strong>From:</strong> ${email}</p><p>${message}</p>`,
      replyTo: email
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return res.status(200).json({ message: 'Email sent successfully' });
    
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({ 
      message: 'Error sending email',
      error: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on https://localhost:${PORT}`);
});