import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../i18n/en.json';
import el from '../../i18n/el.json';

export const SUPPORTED_LANGUAGES = ['en', 'el'];
const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'site-lang';

// Saved choice first, then the browser's language, then English
function getInitialLanguage() {
    let saved = null;
    try {
        saved = localStorage.getItem(STORAGE_KEY);
    } catch {
    }
    if (SUPPORTED_LANGUAGES.includes(saved)) {
        return saved;
    }
    const browserLanguage = (navigator.language || '').slice(0, 2).toLowerCase();
    return SUPPORTED_LANGUAGES.includes(browserLanguage) ? browserLanguage : DEFAULT_LANGUAGE;
}

// initAsync: false so t() works immediately after init and React never suspends waiting on it
i18next.use(initReactI18next).init({
    resources: { en: { translation: en }, el: { translation: el } },
    lng: getInitialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
});


export function apiMessage(result, fallback = '') {
    const key = `api-${result?.code}`;
    if (result?.code && i18next.exists(key)) {
        return i18next.t(key, { ttl: result.ttl });
    }
    return result?.message || fallback;
}

export function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
        if (i18next.exists(el.dataset.i18n)) {
            el.textContent = i18next.t(el.dataset.i18n);
        }
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
        if (i18next.exists(el.dataset.i18nHtml)) {
            el.innerHTML = i18next.t(el.dataset.i18nHtml);
        }
    });
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
        el.dataset.i18nAttr.split(';').forEach((pair) => {
            const [attr, key] = pair.split(':').map((part) => part.trim());
            if (attr && key && i18next.exists(key)) {
                el.setAttribute(attr, i18next.t(key));
            }
        });
    });
}

export function setLanguage(lng) {
    if (!SUPPORTED_LANGUAGES.includes(lng)) {
        return;
    }
    try {
        localStorage.setItem(STORAGE_KEY, lng);
    } catch {
    }
    return i18next.changeLanguage(lng);
}
window.setLanguage = setLanguage;

const SWITCHER_LABELS = { en: 'EN', el: 'ΕΛ' };

function updateSwitcher() {
    document.querySelectorAll('.lang-switcher button').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.lang === i18next.language));
    });
}

function syncNavbarHeight() {
    const navbar = document.getElementById('navbar');
    if (!navbar || navbar.querySelector('.collapse.show, .collapsing')) {
        return;
    }
    document.documentElement.style.setProperty('--navbar-height', `${navbar.offsetHeight}px`);
}

// Pages opt out with data-no-lang-switcher on <body> (the weather page has its own layout)
function renderLanguageSwitcher() {
    if (document.body.hasAttribute('data-no-lang-switcher')) {
        return;
    }

    const switcher = document.createElement('div');
    switcher.className = 'lang-switcher';
    switcher.setAttribute('role', 'group');
    switcher.dataset.i18nAttr = 'aria-label:language.label';
    switcher.setAttribute('aria-label', 'Language');

    SUPPORTED_LANGUAGES.forEach((lng) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.lang = lng;
        button.dataset.lang = lng;
        button.dataset.i18nAttr = `aria-label:language.${lng}`;
        button.setAttribute('aria-label', lng);
        button.textContent = SWITCHER_LABELS[lng];
        button.addEventListener('click', () => setLanguage(lng));
        switcher.append(button);
    });

    const navbar = document.getElementById('navbar');
    const anchor = navbar ? navbar.closest('header') || navbar : null;
    if (anchor) {
        anchor.insertAdjacentElement('afterend', switcher);
    } else {
        document.body.prepend(switcher);
    }

    syncNavbarHeight();
    window.addEventListener('load', syncNavbarHeight);
    window.addEventListener('resize', syncNavbarHeight);
}

i18next.on('languageChanged', (lng) => {
    document.documentElement.lang = lng;
    applyTranslations();
    updateSwitcher();
});

function onReady() {
    renderLanguageSwitcher();
    applyTranslations();
    updateSwitcher();
}

document.documentElement.lang = i18next.language;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
} else {
    onReady();
}

export default i18next;
