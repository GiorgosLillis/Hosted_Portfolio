export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_+;':",./?-])[A-Za-z\d@$!%*?&#^_+;':",./?-]{8,}$/;
export const nameRegex = /^[a-zA-Z'-]{1,50}$/;

export function isValidEmail(email) {
    return !!email && emailRegex.test(email);
}

export function isValidPassword(password) {
    return !!password && passwordRegex.test(password);
}

export function isValidName(name) {
    return !!name && nameRegex.test(name);
}
