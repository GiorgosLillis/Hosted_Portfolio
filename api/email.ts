import sanitizeHTML from './lib/sanitize.js';
import { rateLimiter } from './lib/rateLimiter.js';
import { recaptchaMiddleware } from './lib/recaptcha.js';
import { getClientIp, sendStatus } from './lib/functions.js';
import { transporter } from './lib/mailer.js';
import { VercelRequest, VercelResponse } from '@vercel/node';

function validateInputs(email: string, subject: string, message: string) {

  const errors: string[] = [];

  // HTML-significant characters are rejected so the address can go into the mail body unmodified
  if (!email || !/^[^\s@<>"'&]+@[^\s@<>"'&]+\.[^\s@<>"'&]+$/.test(email)) {
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
const emailHandler = async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return sendStatus(res, 405, 'method-not-allowed', 'Only POST requests are allowed');
  }

  try {

    // IP tracking for rate limiting
    const ip = getClientIp(req);
    const { allowed, ttl } = await rateLimiter(ip, 5, 60);
    if (!allowed) {
      return sendStatus(res, 429, 'rate-limited', `Too many requests. Please try again in ${ttl} seconds.`, { ttl: ttl });
    }

    const { email, subject, message } = req.body;

    if (!email || !subject || !message) {
      return sendStatus(res, 400, 'missing-fields', 'Missing required fields');
    }

    // Format checks plus HTML sanitizing on subject/message
    const { errors: validationErrors, safe_subject, safe_message } = validateInputs(email, subject, message);
    if (validationErrors.length > 0) {
      return sendStatus(res, 400, 'validation-failed', 'Validation failed', { errors: validationErrors });
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

    return sendStatus(res, 200, 'email-sent', 'Email sent successfully');

  } catch (error) {
    console.error(error);
    return sendStatus(res, 500, 'server-error', 'An unexpected error occurred', { error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined });
  }
};

export default (req: VercelRequest, res: VercelResponse) => {
  return recaptchaMiddleware(req, res, () => emailHandler(req, res));
};
