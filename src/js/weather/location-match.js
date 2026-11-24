const toNumber = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value));

// Place names change with the language, so coordinates decide when both sides have them (~1 km tolerance), names only as a fallback.
// Accepts both {city, country} and {name, country} shapes.
export function isSameLocation(a, b) {
    if (!a || !b) {
        return false;
    }
    const [aLat, aLon, bLat, bLon] = [a.latitude, a.longitude, b.latitude, b.longitude].map(toNumber);
    if ([aLat, aLon, bLat, bLon].every(Number.isFinite)) {
        return Math.abs(aLat - bLat) < 0.01 && Math.abs(aLon - bLon) < 0.01;
    }

    const aName = a.name ?? a.city;
    const bName = b.name ?? b.city;
    return Boolean(aName && bName && a.country && b.country) &&
        aName.toLowerCase() === bName.toLowerCase() &&
        a.country.toLowerCase() === b.country.toLowerCase();
}
