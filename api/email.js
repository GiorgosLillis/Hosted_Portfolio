const nodemailer = require('nodemailer');
const axios = require('axios');
require('dotenv').config();
const sanitizeHTML = require('../lib/sanitize.js');

async function verifyRecaptcha(token) {
  if (!token) {
    throw new Error('reCAPTCHA token is required');
  }
  
  try {
    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: token
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 3000
      }
    );

    return {
      success: response.data.success,
      score: response.data.score,
      action: response.data.action,
      errors: response.data['error-codes'] || []
    };
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    throw new Error('Failed to verify reCAPTCHA');
  }
}

function validateInputs(email, subject, message) {

  const safe_subject = sanitizeHTML(subject);
  const safe_message = sanitizeHTML(message);
  
  const errors = [];
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please enter a valid email address');
  }
  
  if (!safe_subject || safe_subject.trim().length < 1 || safe_subject.length > 100) {
    errors.push('Subject must be between 2-100 characters');
  }
  
  if (!safe_message ||  safe_message.trim().length < 1 ||  safe_message.length > 1000) {
    errors.push('Message must be between 10-1000 characters');
  }
  
  return { errors, safe_subject, safe_message };
}

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
    return res.status(405).json({ 
      success: false,
      message: 'Only POST requests are allowed' 
    });
  }
  
  try {
    const { email, subject, message, 'g-recaptcha-response': recaptchaToken } = req.body;


    if (!email || !subject || !message) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (!recaptchaToken) {
      return res.status(400).json({
        success: false,
        message: 'reCAPTCHA token is required'
      });
    }

    const { success, score, error} = await verifyRecaptcha(recaptchaToken);
    if (!success) {
      return res.status(403).json({
        success: false,
        message: 'reCAPTCHA verification failed!',
        score,
        errors: error
      });
    }

    if (score < 0.5) {
      return res.status(403).json({
      success: false,
      message: 'reCAPTCHA score too low, suspected bot.',
      score
    });
    }

    const { errors: validationErrors, safe_subject, safe_message } = validateInputs(email, subject, message);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const mailOptions = {
      from: `"Contact Form" <${process.env.EMAIL_ID}>`,
      to: process.env.EMAIL_ID,
      subject: `[Contact Form] ${safe_subject}`,
      text: `From: ${email}\n\n${safe_message}`,
      html: `<p><strong>From:</strong> ${email}</p><p>${safe_message.replace(/\n/g, '<br>')}</p>`,
      replyTo: email
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
      score // Optional: Return score for debugging
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
