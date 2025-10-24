import { showToast } from './toast.js';

const RECAPTCHA_SITE_KEY = '6Lc560ErAAAAAP7bly7AL_F_5AxlDf8zW7xxbML6';

let isRecaptchaLoaded = false;

function loadRecaptchaScript() {
    if (isRecaptchaLoaded) {
        return;
    }

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
    isRecaptchaLoaded = true;
}

async function getRecaptchaToken(action) {
    if (typeof grecaptcha === 'undefined' || !grecaptcha.execute) {
        showToast('reCAPTCHA not loaded, please try again later.', 'danger');
        throw new Error('reCAPTCHA not loaded');
    }

    try {
        const token = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action });
        if (!token) {
            showToast('Could not get reCAPTCHA token, please try again.', 'danger');
            throw new Error('reCAPTCHA token missing');
        }
        return token;
    } catch (error) {
        console.error('reCAPTCHA execution error:', error);
        showToast('An error occurred during reCAPTCHA verification.', 'danger');
        throw error;
    }
}

export { loadRecaptchaScript, getRecaptchaToken };
