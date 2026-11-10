import { showToast } from './toast.js';
import i18next from './i18n.js';

const RECAPTCHA_SITE_KEY = '6Lc560ErAAAAAP7bly7AL_F_5AxlDf8zW7xxbML6';

let isRecaptchaLoaded = false;

// Injects Google's reCAPTCHA v3 script once per page load
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

// Gets a fresh token for the given action, needed before every gated form submit
async function getRecaptchaToken(action) {
    if (typeof grecaptcha === 'undefined' || !grecaptcha.execute) {
        showToast(i18next.t('recaptcha-not-loaded'), 'danger');
        throw new Error('reCAPTCHA not loaded');
    }

    try {
        const token = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action });
        if (!token) {
            showToast(i18next.t('recaptcha-no-token'), 'danger');
            throw new Error('reCAPTCHA token missing');
        }
        return token;
    } catch (error) {
        console.error('reCAPTCHA execution error:', error);
        showToast(i18next.t('recaptcha-exec-error'), 'danger');
        throw error;
    }
}

export { loadRecaptchaScript, getRecaptchaToken };
