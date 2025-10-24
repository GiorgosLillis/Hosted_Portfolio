import nodemailer from 'nodemailer';
import sanitizeHTML from '../lib/sanitize.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { recaptchaMiddleware } from './recaptcha.js';

function validateInputs(email, subject, message) {

  const errors = [];
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please enter a valid email address');
  }
  
  if (!subject || subject.trim().length < 2 || subject.length > 100) {
    errors.push('Subject must be between 2-100 characters');
  }
  
  if (!message ||  message.trim().length < 10 ||  message.length > 1000) {
    errors.push('Message must be between 10-1000 characters');
  }
  
  const safe_subject = sanitizeHTML(subject);
  const safe_message = sanitizeHTML(message);

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

const emailHandler = async (req, res) => {
   if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      message: 'Only POST requests are allowed' 
    });
  }
  
  try {

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const { allowed, ttl } = await rateLimiter(ip, 5, 60);
    if (!allowed) {
      return res.status(429).json({ 
        success: false, 
        message: `Too many requests. Please try again in ${ttl} seconds.` 
      });
    }

    const { email, subject, message } = req.body;


    if (!email || !subject || !message) {
      return res.status(400).json({ message: 'Missing required fields' });
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
      message: 'Email sent successfully'
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

export default (req, res) => {
  recaptchaMiddleware(req, res, () => emailHandler(req, res));
};
