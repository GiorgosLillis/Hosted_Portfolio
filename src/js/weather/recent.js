import { isSameLocation } from './location-match.js';

const RECENT_KEY = 'recentCities';
const MAX_CITIES = 5;

export function loadRecents() {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY));
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

export function clearRecents() {
    try {
        localStorage.removeItem(RECENT_KEY);
    } catch (error) {
        console.error('Failed to clear recent cities:', error);
    }
    return [];
}

// Newest first, deduped by place (a city searched in another language counts as the same), capped at MAX_CITIES. Returns the updated list.
export function addRecents({ city, country, region, latitude, longitude }) {
    const sameCity = (entry) => isSameLocation(entry, { city, country, latitude, longitude });

    const updated = [
        { name: city, country, region, latitude, longitude, searchedAt: Date.now() },
        ...loadRecents().filter(entry => !sameCity(entry)),
    ].slice(0, MAX_CITIES);

    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    } catch (error) {
        console.error('Failed to save recent cities:', error);
    }
    return updated;
}
