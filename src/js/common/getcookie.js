// Plain, non-httpOnly cookie reader, works for the "session-active" flag but never the real JWT
export function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}
// Resolves to the logged-in user or null, never rejects, safe to call without a try/catch
export function checkAuth() {
    return new Promise((resolve) => {
        // No point calling the API if the flag cookie isn't even set
        if (!getCookie('session-active')) {
            return resolve(null);
        }

        fetch('/api/user')
            .then(response => {
                if (!response.ok) {
                    return resolve(null);
                }
                return response.json();
            })
            .then(data => {
                resolve(data.user);
            })
            .catch(() => {
                resolve(null);
            });
    });
}