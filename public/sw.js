// sw.js
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    // 1. Setup fallback data just in case the payload is incomplete
    let data = {
        cityName: 'your area',
        condition: 'Clear',
        tempMin: '--',
        tempMax: '--',
        icon: '',
        img: null
    };

    // 2. Parse the incoming push payload from your backend
    try {
        if (event.data) {
            data = { ...data, ...event.data.json() };
        }
    } catch (err) {
        console.error('Failed to parse push payload:', err);
    }

    // 3. Format the paths and replace SVG with PNG
    const formatPath = (path) => (path && !path.startsWith('/') ? `/${path}` : path);

    let rawIconPath = formatPath(data.icon);
    let iconUrl = rawIconPath ? rawIconPath.replace('.svg', '.png') : '';
    let imageUrl = formatPath(data.img);

    // 4. Trigger the notification
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