import crypto from 'crypto';

// Everything the push notification endpoints need besides the database and web-push themselves: who may call notify,
// which subscription endpoints are accepted, and the text of the notification.

// Compares the Authorization header with "Bearer <CRON_SECRET>" in constant time, so the secret can't be guessed from response timing
export function isValidCronAuthorization(authorization: string | undefined | null, secret: string | undefined): boolean {
  if (!secret || typeof authorization !== 'string') {
    return false;
  }
  const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

// Only the browsers' own push services are allowed (Chrome/Edge/Brave/Samsung via FCM, Firefox, Safari, Windows).
const EXACT_HOSTS = ['fcm.googleapis.com'];
const HOST_SUFFIXES = ['.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'];

export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string') {
    return false;
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    return false;
  }

  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.includes(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

// Text of the daily weather notification, built on the server because the browser is not running when it is sent.
// The Greek condition names mirror the "condition-<code>" keys in src/i18n/el.json.

export const NOTIFICATION_LANGS = ['en', 'el'] as const;
export type NotificationLang = typeof NOTIFICATION_LANGS[number];

export function pickNotificationLang(lang: unknown): NotificationLang {
  return NOTIFICATION_LANGS.includes(lang as NotificationLang) ? (lang as NotificationLang) : 'en';
}

const GREEK_CONDITIONS: Record<number, string> = {
  0: 'Αίθριος καιρός',
  1: 'Κυρίως αίθριος',
  2: 'Μερικώς νεφελώδης',
  3: 'Πυκνή συννεφιά',
  45: 'Ομίχλη',
  48: 'Ομίχλη με παγετό',
  51: 'Ψιλόβροχο: Ασθενές',
  53: 'Ψιλόβροχο: Μέτριο',
  55: 'Ψιλόβροχο: Έντονο',
  56: 'Παγωμένο ψιλόβροχο: Ασθενές',
  57: 'Παγωμένο ψιλόβροχο: Έντονο',
  61: 'Βροχή: Ασθενής',
  63: 'Βροχή: Μέτρια',
  65: 'Βροχή: Ισχυρή',
  66: 'Παγωμένη βροχή: Ασθενής',
  67: 'Παγωμένη βροχή: Ισχυρή',
  71: 'Χιονόπτωση: Ασθενής',
  73: 'Χιονόπτωση: Μέτρια',
  75: 'Χιονόπτωση: Ισχυρή',
  77: 'Κόκκοι χιονιού',
  80: 'Βροχοπτώσεις: Ασθενείς',
  81: 'Βροχοπτώσεις: Μέτριες',
  82: 'Βροχοπτώσεις: Σφοδρές',
  85: 'Χιονοπτώσεις: Ασθενείς',
  86: 'Χιονοπτώσεις: Ισχυρές',
  95: 'Καταιγίδα: Ασθενής ή μέτρια',
  96: 'Καταιγίδα με ελαφρύ χαλάζι',
  99: 'Καταιγίδα με ισχυρό χαλάζι',
};

const TEXT = {
  en: {
    title: (city: string) => `Tomorrow's weather in ${city}`,
    area: 'your area',
    unknown: 'Unknown conditions',
    view: 'Open Forecast',
    dismiss: 'Dismiss',
  },
  el: {
    title: (city: string) => `Πρόγνωση για αύριο: ${city}`,
    area: 'Η περιοχή σας',
    unknown: 'Άγνωστες συνθήκες',
    view: 'Άνοιγμα πρόγνωσης',
    dismiss: 'Απόρριψη',
  },
};

interface ForecastForNotification {
  city?: string | null;
  code?: number;
  englishCondition?: string;
  tempMin: number;
  tempMax: number;
}

// Title, body and button labels in the subscription's language
export function buildNotificationText(lang: NotificationLang, forecast: ForecastForNotification) {
  const text = TEXT[lang];
  const condition = lang === 'el'
    ? (forecast.code !== undefined && GREEK_CONDITIONS[forecast.code]) || text.unknown
    : forecast.englishCondition || text.unknown;
  const cityName = forecast.city || text.area;

  return {
    cityName,
    condition,
    title: text.title(cityName),
    body: `${condition}, ${forecast.tempMin}° - ${forecast.tempMax}°`,
    actions: [
      { action: 'view-forecast', title: text.view },
      { action: 'dismiss', title: text.dismiss },
    ],
  };
}
