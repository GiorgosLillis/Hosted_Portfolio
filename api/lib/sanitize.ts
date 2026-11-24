// Dependency-free input cleaning and format checks, kept out of functions.ts so the contact form doesn't load Prisma, Redis and JWT.

// Escapes markup in plain-text input. No jsdom/DOMPurify: its CSS dependencies are ESM-only and crash on Vercel's runtime.
export default function sanitizeHTML(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Mailbox providers treat addresses case-insensitively
export function normalizeEmail(email: any): any {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_+;':",./?-])[A-Za-z\d@$!%*?&#^_+;':",./?-]{8,}$/;
const nameRegex = /^[\p{L}\p{M}'-]{1,50}$/u;

export function isValidEmail(email?: string | null): boolean {
  return !!email && emailRegex.test(email);
}

export function isValidPassword(password?: string | null): boolean {
  return !!password && passwordRegex.test(password);
}

export function isValidName(name?: string | null): boolean {
  return !!name && nameRegex.test(name);
}
