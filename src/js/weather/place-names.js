import i18next from '../common/i18n.js';
import { fetchWithTimeout } from '../common/fetchWithTimeout.js';

// Stored cities (recents, favorites, location caches) always keep their one canonical name. Translations live here, keyed by
// coordinates, and are only applied when drawing the screen, so switching language never rewrites stored data.
const NAMES_KEY = 'placeNames';
const REQUEST_GAP_MS = 1100; // Nominatim allows about one request per second
export const PLACE_NAMES_EVENT = 'placenames-updated';

const toNumber = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value));
const hasCoordinates = (place) => Number.isFinite(toNumber(place?.latitude)) && Number.isFinite(toNumber(place?.longitude));

const placeKey = (place) => `${Number(place.latitude).toFixed(2)},${Number(place.longitude).toFixed(2)}`;

function loadNames() {
    try {
        return JSON.parse(localStorage.getItem(NAMES_KEY)) || {};
    } catch {
        return {};
    }
}

function saveNames(names) {
    try {
        localStorage.setItem(NAMES_KEY, JSON.stringify(names));
    } catch (error) {
        console.error('Failed to save translated place names:', error);
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// City, country and region (when known) of a place in the active language, its stored (English) names until the translation is known.
// Accepts {city, country} and {name, country}.
export function localName(place) {
    const canonical = { city: place.city ?? place.name, country: place.country, region: place.region };
    const lang = i18next.language;
    if (lang === 'en' || !hasCoordinates(place)) {
        return canonical;
    }
    const translated = loadNames()[placeKey(place)]?.[lang];
    // A place without a known region never shows one, a translation of the first match's region could belong to another place with that name
    return translated ? { ...translated, region: place.region ? translated.region || place.region : undefined } : canonical;
}

async function lookUp(place, lang) {
    try {
        const res = await fetchWithTimeout('/api/Forward_Location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // The stored region keeps the lookup on the right place when several share the name
            body: JSON.stringify({ city: place.city ?? place.name, country: place.country, ...(place.region && { state: place.region }), lang }),
        });
        if (!res.ok) {
            return null;
        }
        const data = await res.json();
        return data && data.city ? { city: data.city, country: data.country_name || place.country, region: data.state || '' } : null;
    } catch (error) {
        console.error('Could not translate the place names:', error);
        return null;
    }
}

// Resolves once this one place has its translation for the active language, skipping the line of paced lookups. Failures are ignored.
export async function translateNow(place) {
    const lang = i18next.language;
    if (lang === 'en' || !place || !hasCoordinates(place) || loadNames()[placeKey(place)]?.[lang]) {
        return;
    }
    const translated = await lookUp(place, lang);
    if (translated) {
        const all = loadNames();
        const key = placeKey(place);
        all[key] = { ...all[key], [lang]: translated };
        saveNames(all);
        window.dispatchEvent(new CustomEvent(PLACE_NAMES_EVENT));
    }
}

let queue = Promise.resolve();

// Looks up whatever translations are missing for the active language, one place at a time, and announces each result.
// The first places in the list are done first.
export function translatePlaces(places) {
    const lang = i18next.language;
    if (lang === 'en') {
        return;
    }

    const missing = [];
    const seen = new Set();
    const names = loadNames();
    for (const place of places) {
        if (!place || !hasCoordinates(place) || !(place.city ?? place.name)) {
            continue;
        }
        const key = placeKey(place);
        // A translation saved before regions existed has none, so a place that has a region is looked up again
        if (!seen.has(key) && (!names[key]?.[lang] || (place.region && names[key][lang].region === undefined))) {
            seen.add(key);
            missing.push(place);
        }
    }

    queue = queue.then(async () => {
        for (const place of missing) {
            if (i18next.language !== lang) {
                break;
            }
            const known = loadNames()[placeKey(place)]?.[lang];
            if (known && !(place.region && known.region === undefined)) {
                continue;
            }
            const translated = await lookUp(place, lang);
            if (translated) {
                const all = loadNames();
                const key = placeKey(place);
                all[key] = { ...all[key], [lang]: translated };
                saveNames(all);
                window.dispatchEvent(new CustomEvent(PLACE_NAMES_EVENT));
            }
            await sleep(REQUEST_GAP_MS);
        }
    });
}
