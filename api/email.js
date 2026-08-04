import sanitizeHTML from './lib/sanitize.js';
import { rateLimiter } from './lib/rateLimiter.js';
import { recaptchaMiddleware } from './lib/recaptcha.js';
import { getClientIp } from './lib/functions.js';
import { transporter } from './lib/mailer.js';

function validateInputs(email, subject, message) {

  const errors = [];

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please enter a valid email address');
  }

  if (!subject || subject.length > 100) {
    errors.push('Subject must be 100 characters or less');
  }

  if (!message || message.length > 1000) {
    errors.push('Message must be 1000 characters or less');
  }

  const safe_subject = sanitizeHTML(subject);
  const safe_message = sanitizeHTML(message);

  return { errors, safe_subject, safe_message };
}

// POST only, sends the portfolio contact form to the site owner's inbox
const emailHandler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Only POST requests are allowed'
    });
  }

  try {

    // IP tracking for rate limiting
    const ip = getClientIp(req);
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

    // Format checks plus HTML sanitizing on subject/message
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
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export default (req, res) => {
  return recaptchaMiddleware(req, res, () => emailHandler(req, res));
};
