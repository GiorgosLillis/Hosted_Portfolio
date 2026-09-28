const OFFLINE_CACHE = 'offline-shell-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key)))
        ).then(() => self.clients.claim())
    );
});

// Only intercepts full page loads 
self.addEventListener('fetch', (event) => {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(OFFLINE_URL))
        );
    }
});

self.addEventListener('push', (event) => {
    let data = {
        cityName: 'your area',
        condition: 'Clear',
        tempMin: '--',
        tempMax: '--',
        icon: '',
        img: null
    };

    try {
        if (event.data) {
            data = { ...data, ...event.data.json() };
        }
    } catch (err) {
        console.error('Failed to parse push payload:', err);
    }

    const formatPath = (path) => (path && !path.startsWith('/') ? `/${path}` : path);

    let rawIconPath = formatPath(data.icon);
    let iconUrl = rawIconPath ? rawIconPath.replace('.svg', '.png') : '';
    let imageUrl = formatPath(data.img);

    event.waitUntil(
        self.registration.showNotification(`Tomorrow's weather in ${data.cityName}`, {
            body: `${data.condition}, ${data.tempMin}° - ${data.tempMax}°`,
            tag: 'weather-daily-alert',
            icon: iconUrl,
            image: imageUrl,
            vibrate: [200, 100, 200],
            actions: [
                { action: 'view-forecast', title: 'Open Forecast' },
                { action: 'dismiss', title: 'Dismiss' }
            ]
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'view-forecast') {
        event.waitUntil(self.clients.openWindow('/weather.html'));
        return;
    }

    event.waitUntil(
        (async () => {
            const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            const existing = allClients.find((client) => client.url.includes('weather.html'));
            if (existing) {
                return existing.focus();
            }
            return self.clients.openWindow('/weather.html');
        })()
    );
});