import i18next, { apiMessage } from '../common/i18n.js';
import { fetchWithTimeout } from '../common/fetchWithTimeout.js';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { localName, translateNow } from './place-names.js';

loadRecaptchaScript();

const SUBSCRIPTION_ENDPOINT_KEY = 'weatherPushEndpoint';
const NOTIFY_HOUR_KEY = 'weatherPushNotifyHour';
const SUBSCRIPTION_LOCATION_KEY = 'weatherPushLocation'; // the place the alert was created for, so a language change doesn't move it
const DEFAULT_LOCAL_HOUR = 8;

// The user picks a local hour, but subscriptions are stored/matched in UTC to line up with the cron schedule.
function localHourToUtcHour(localHour) {
    const date = new Date();
    date.setHours(localHour, 0, 0, 0);
    return date.getUTCHours();
}

// Last hour the user picked in this browser
export function getStoredNotifyHour() {
    const stored = parseInt(localStorage.getItem(NOTIFY_HOUR_KEY), 10);
    return isNaN(stored) ? DEFAULT_LOCAL_HOUR : stored;
}

// The push service expects the VAPID key as a raw Uint8Array, not the base64url string it's transmitted as
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
}

// Resolves to the existing PushSubscription, or null if never subscribed / unsupported
export async function getExistingSubscription() {
    if (!isPushSupported()) {
        return null;
    }
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) {
        return null;
    }
    return registration.pushManager.getSubscription();
}

export async function subscribeToWeatherAlerts(locationInfo, localHour = DEFAULT_LOCAL_HOUR) {
    if (!isPushSupported()) {
        throw new Error(i18next.t('push-unsupported'));
    }
    if (!locationInfo?.latitude || !locationInfo?.longitude) {
        throw new Error(i18next.t('push-no-location'));
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error(i18next.t('push-denied'));
    }

    const keyResponse = await fetchWithTimeout('/api/vapid-key');
    const keyData = await keyResponse.json();
    if (!keyResponse.ok || !keyData.publicKey) {
        throw new Error(apiMessage(keyData, i18next.t('push-config-failed')));
    }

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
        });
    }

    // The notification is written in the site's language, including the city name when its translation is known
    await translateNow(locationInfo);
    const place = localName(locationInfo);
    const token = await getRecaptchaToken('subscribe_weather_alerts');

    const response = await fetchWithTimeout('/api/subscribe', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'g-recaptcha-response': token,
        },
        body: JSON.stringify({
            subscription: subscription.toJSON(),
            latitude: locationInfo.latitude,
            longitude: locationInfo.longitude,
            city: place.city,
            country: place.country,
            notifyHour: localHourToUtcHour(localHour),
            lang: i18next.language,
        }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(apiMessage(data, i18next.t('push-enable-failed')));
    }

    localStorage.setItem(SUBSCRIPTION_ENDPOINT_KEY, subscription.endpoint);
    localStorage.setItem(NOTIFY_HOUR_KEY, String(localHour));
    localStorage.setItem(SUBSCRIPTION_LOCATION_KEY, JSON.stringify({
        latitude: locationInfo.latitude,
        longitude: locationInfo.longitude,
        city: locationInfo.city,
        country: locationInfo.country,
    }));
}

export async function unsubscribeFromWeatherAlerts() {
    const subscription = await getExistingSubscription();
    if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        // Best-effort: the local unsubscribe above already stops future pushes for this browser either way
        await fetchWithTimeout('/api/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
        }).catch((err) => console.error('Failed to remove subscription from server:', err));
    }
    localStorage.removeItem(SUBSCRIPTION_ENDPOINT_KEY);
    localStorage.removeItem(NOTIFY_HOUR_KEY);
    localStorage.removeItem(SUBSCRIPTION_LOCATION_KEY);
}

// The notification text follows the site language, so a subscribed browser tells the server when the language changes.
// Only the language (and the city label, when the alert's place is remembered) is sent, the alert itself is not recreated.
export async function updateAlertLanguage() {
    const subscription = await getExistingSubscription();
    if (!subscription) {
        return;
    }

    let city;
    try {
        const saved = JSON.parse(localStorage.getItem(SUBSCRIPTION_LOCATION_KEY));
        if (saved) {
            await translateNow(saved);
            city = localName(saved).city;
        }
    } catch {
    }

    const response = await fetchWithTimeout('/api/update-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint, lang: i18next.language, city }),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(apiMessage(data, i18next.t('push-enable-failed')));
    }
}
