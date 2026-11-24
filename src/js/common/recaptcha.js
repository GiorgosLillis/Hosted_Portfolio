import { showToast } from './toast.js';
import i18next from './i18n.js';

const RECAPTCHA_SITE_KEY = '6Lc560ErAAAAAP7bly7AL_F_5AxlDf8zW7xxbML6';
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'];

let scriptPromise = null;
let waitingForInteraction = false;

// Injects Google's reCAPTCHA v3 script once, safe to call repeatedly. Resolves when the script has loaded.
function injectScript() {
    if (!scriptPromise) {
        scriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
            script.async = true;
            script.defer = true;
            script.onload = resolve;
            script.onerror = () => {
                scriptPromise = null;
                reject(new Error('reCAPTCHA script failed to load'));
            };
            document.head.appendChild(script);
        });
    }
    return scriptPromise;
}

// Loads the script on the visitor's first interaction instead of on page load
function loadRecaptchaScript() {
    if (scriptPromise || waitingForInteraction) {
        return;
    }
    waitingForInteraction = true;

    const start = () => {
        INTERACTION_EVENTS.forEach((eventName) => window.removeEventListener(eventName, start));
        injectScript().catch((error) => console.error(error));
    };
    INTERACTION_EVENTS.forEach((eventName) => window.addEventListener(eventName, start, { passive: true }));
}

// Gets a fresh token for the given action, needed before every gated form submit
async function getRecaptchaToken(action) {
    try {
        await injectScript();
        await new Promise((resolve) => grecaptcha.ready(resolve));
    } catch (error) {
        console.error('reCAPTCHA load error:', error);
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
