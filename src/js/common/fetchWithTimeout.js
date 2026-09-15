const DEFAULT_TIMEOUT_MS = 15000;

// Bounds a fetch to our own API so a stalled network/cold start can't hang the UI forever
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('Request timed out. Please check your connection and try again.');
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}
