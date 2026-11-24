// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./toast.js', () => ({
    showToast: vi.fn(),
}));

vi.mock('./i18n.js', () => ({
    default: { t: (key) => key },
}));

const SITE_KEY = '6Lc560ErAAAAAP7bly7AL_F_5AxlDf8zW7xxbML6';
const scripts = () => document.head.querySelectorAll('script[src*="recaptcha/api.js"]');

let loadRecaptchaScript;
let getRecaptchaToken;
let showToast;
let addedListeners = [];
let addListenerSpy;

beforeEach(async () => {
    document.head.innerHTML = '';

    // Each test loads its own copy of the module, so the listeners it adds must not outlive the test
    const realAddEventListener = window.addEventListener.bind(window);
    addListenerSpy = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
        addedListeners.push([type, listener]);
        realAddEventListener(type, listener, options);
    });
    window.grecaptcha = { ready: (callback) => callback(), execute: vi.fn().mockResolvedValue('the-token') };

    // The module keeps its loading state at module level, so every test gets a fresh copy
    vi.resetModules();
    ({ loadRecaptchaScript, getRecaptchaToken } = await import('./recaptcha.js'));
    ({ showToast } = await import('./toast.js'));
    showToast.mockClear();
});

afterEach(() => {
    addedListeners.forEach(([type, listener]) => window.removeEventListener(type, listener));
    addedListeners = [];
    addListenerSpy.mockRestore();
});

describe('loadRecaptchaScript', () => {
    it('does not load Google\'s script until the visitor interacts with the page', () => {
        loadRecaptchaScript();
        expect(scripts()).toHaveLength(0);
    });

    it('loads the script once on the first interaction, whichever kind it is', () => {
        loadRecaptchaScript();
        loadRecaptchaScript();

        window.dispatchEvent(new Event('pointerdown'));
        window.dispatchEvent(new Event('keydown'));
        window.dispatchEvent(new Event('scroll'));

        expect(scripts()).toHaveLength(1);
        expect(scripts()[0].src).toBe(`https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`);
    });
});

describe('getRecaptchaToken', () => {
    it('loads the script itself when a form is submitted before any interaction, then returns the token', async () => {
        const pending = getRecaptchaToken('login');

        expect(scripts()).toHaveLength(1);
        scripts()[0].onload();

        await expect(pending).resolves.toBe('the-token');
        expect(window.grecaptcha.execute).toHaveBeenCalledWith(SITE_KEY, { action: 'login' });
    });

    it('reuses the script that the first interaction already loaded', async () => {
        loadRecaptchaScript();
        window.dispatchEvent(new Event('pointerdown'));
        const pending = getRecaptchaToken('signup');
        scripts()[0].onload();

        await expect(pending).resolves.toBe('the-token');
        expect(scripts()).toHaveLength(1);
    });

    it('shows a toast and rejects when the script cannot be loaded, and tries again next time', async () => {
        const failed = getRecaptchaToken('login');
        scripts()[0].onerror();

        await expect(failed).rejects.toThrow('reCAPTCHA not loaded');
        expect(showToast).toHaveBeenCalledWith('recaptcha-not-loaded', 'danger');

        const retry = getRecaptchaToken('login');
        expect(scripts()).toHaveLength(2);
        scripts()[1].onload();
        await expect(retry).resolves.toBe('the-token');
    });

    it('shows a toast and rejects when Google returns no token', async () => {
        window.grecaptcha.execute.mockResolvedValue('');
        const pending = getRecaptchaToken('login');
        scripts()[0].onload();

        await expect(pending).rejects.toThrow('reCAPTCHA token missing');
        expect(showToast).toHaveBeenCalledWith('recaptcha-no-token', 'danger');
    });
});
