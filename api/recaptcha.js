import axios from 'axios';
import 'dotenv/config';

export async function verifyRecaptcha(token) {
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

export async function recaptchaMiddleware(req, res, next) {
    const recaptchaToken = req.body['g-recaptcha-response'] || req.headers['g-recaptcha-response'];

    if (!recaptchaToken) {
        return res.status(400).json({
            success: false,
            message: 'reCAPTCHA token is required'
        });
    }

    try {
        const { success, score, errors } = await verifyRecaptcha(recaptchaToken);

        if (!success) {
            return res.status(403).json({
                success: false,
                message: 'reCAPTCHA verification failed!',
                errors
            });
        }

        if (score < 0.5) {
            return res.status(403).json({
                success: false,
                message: 'reCAPTCHA score too low, suspected bot.',
                score
            });
        }

        next();
    } catch (error) {
        console.error('reCAPTCHA middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred during reCAPTCHA verification'
        });
    }
}