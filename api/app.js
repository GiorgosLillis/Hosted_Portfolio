const nodemailer = require('nodemailer');
const axios = require('axios');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_ID,
    pass: process.env.EMAIL_PASSWORD,
  },
  connectionTimeout: 5000, 
  greetingTimeout: 5000,
  socketTimeout: 10000
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST allowed' });
  }

  const { email, subject, message, recaptchaToken } = req.body;

  if (!recaptchaToken) {
    return res.status(400).json({ message: "Captcha required" });
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`;

  try {
    const { data } = await axios.post(verifyURL);
    if (!data.success) {
      return res.status(403).json({ message: "Captcha verification failed" });
    }
  } catch (error) {
    console.error('❌ Captcha verification failed:', error);
    return res.status(500).json({ message: "Internal error during captcha verification" });
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

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info.messageId);
    return res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('❌ Email send error:', error);
    return res.status(500).json({ message: 'Error sending email', error: error.message });
  }
};
