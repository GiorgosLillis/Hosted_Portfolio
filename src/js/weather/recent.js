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

// Newest first, deduped by city + country, capped at MAX_CITIES. Returns the updated list.
export function addRecents({ city, country, latitude, longitude }) {
    const sameCity = (entry) => entry.name.toLowerCase() === city.toLowerCase() && entry.country.toLowerCase() === country.toLowerCase();

    const updated = [
        { name: city, country, latitude, longitude, searchedAt: Date.now() },
        ...loadRecents().filter(entry => !sameCity(entry)),
    ].slice(0, MAX_CITIES);

    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    } catch (error) {
        console.error('Failed to save recent cities:', error);
    }
    return updated;
}
