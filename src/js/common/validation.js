export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_+;':",./?-])[A-Za-z\d@$!%*?&#^_+;':",./?-]{8,}$/;
export const nameRegex = /^[\p{L}\p{M}'-]{1,50}$/u;
// Shopping list item names: letters of any language, numbers, spaces and the punctuation real products use
// ("M&M's", "Coca-Cola", "Milk 2%", "Water (1.5L)"). Same rule as the server's list.ts.
export const itemNameRegex = /^[\p{L}\p{M}\p{N} .,'’&()/%+!?-]+$/u;

export function isValidEmail(email) {
    return !!email && emailRegex.test(email);
}

export function isValidPassword(password) {
    return !!password && passwordRegex.test(password);
}

export function isValidName(name) {
    return !!name && nameRegex.test(name);
}

export function hasOnlyAllowedItemCharacters(item) {
    return !!item && itemNameRegex.test(item);
}
