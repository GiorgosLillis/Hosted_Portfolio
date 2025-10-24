export function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
} 
export function checkAuth() {
    return new Promise((resolve) => {
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