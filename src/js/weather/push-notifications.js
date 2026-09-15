import { fetchWithTimeout } from '../common/fetchWithTimeout.js';
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';

loadRecaptchaScript();

const SUBSCRIPTION_ENDPOINT_KEY = 'weatherPushEndpoint';
const NOTIFY_HOUR_KEY = 'weatherPushNotifyHour';
const DEFAULT_LOCAL_HOUR = 8;

// The user picks a local hour, but subscriptions are stored/matched in UTC to line up with the cron schedule.
// This is a one-time conversion at subscribe time, so it won't self-correct across a DST change afterwards.
function localHourToUtcHour(localHour) {
    const date = new Date();
    date.setHours(localHour, 0, 0, 0);
    return date.getUTCHours();
}

// Last hour the user picked in this browser, purely for pre-filling the dropdown (the server only stores the UTC hour)
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
        throw new Error('Push notifications are not supported in this browser.');
    }
    if (!locationInfo?.latitude || !locationInfo?.longitude) {
        throw new Error('Location is not available yet. Please try again in a moment.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error('Notification permission was not granted.');
    }

    const keyResponse = await fetchWithTimeout('/api/vapid-key');
    const keyData = await keyResponse.json();
    if (!keyResponse.ok || !keyData.publicKey) {
        throw new Error(keyData.message || 'Could not load push notification configuration.');
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
            city: locationInfo.city,
            country: locationInfo.country,
            notifyHour: localHourToUtcHour(localHour),
        }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to enable weather alerts.');
    }

    localStorage.setItem(SUBSCRIPTION_ENDPOINT_KEY, subscription.endpoint);
    localStorage.setItem(NOTIFY_HOUR_KEY, String(localHour));
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
}
