import { checkAuth } from "../common/getcookie.js";
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { showToast } from '../common/toast.js';
import { fetchWithTimeout } from '../common/fetchWithTimeout.js';
import i18next from '../common/i18n.js';

const t = (key, options) => i18next.t(key, options);

loadRecaptchaScript();

// Local-only store vs the account's server-synced store 
const LOCAL_FAVORITES_KEY = 'localFavoriteLocations';
const ACCOUNT_FAVORITES_KEY = 'accountFavoriteLocations';

// The server replaces the stored favorites with this list, so a city missing from it is deleted there too
export async function saveCityList(cityList) {
    try {
        const user = await checkAuth();
        if (!user) {
            // Not authenticated 
            localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(cityList));
            showToast(t('fc-favs-saved-local'), 'success');
            return { success: true };
        }

        showToast(t('fc-favs-saving'), 'info');
        const token = await getRecaptchaToken('save_city_list');
        const response = await fetchWithTimeout('/api/cities', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'g-recaptcha-response': token
            },
            body: JSON.stringify({ list: cityList })
        });

        if (!response.ok) {
            showToast(t('fc-favs-sync-failed'), 'danger');
            return { success: false };
        }

        localStorage.setItem(ACCOUNT_FAVORITES_KEY, JSON.stringify(cityList));
        showToast(t('fc-favs-saved'), 'success');
        return { success: true };
    } catch (error) {
        showToast(t('fc-favs-sync-error'), 'danger');
        return { success: false };
    }
}

export async function loadCityList() {
    try {
        const user = await checkAuth();
        if (!user) {
            // Not authenticated 
            showToast(t('fc-favs-showing-local'), 'info');
            const localList = localStorage.getItem(LOCAL_FAVORITES_KEY);
            return JSON.parse(localList) || [];
        }

        showToast(t('fc-favs-loading'), 'info');
        const response = await fetchWithTimeout(`/api/cities`);
        if (!response.ok) {
            showToast(t('fc-favs-fetch-failed'), 'danger');
            // Still authenticated, fall back to the last-known account cache
            const cachedAccountList = localStorage.getItem(ACCOUNT_FAVORITES_KEY);
            return JSON.parse(cachedAccountList) || [];
        }

        const data = await response.json();
        const list = data.list || [];
        localStorage.setItem(ACCOUNT_FAVORITES_KEY, JSON.stringify(list));
        showToast(t('fc-favs-loaded'), 'success');
        return list;
    } catch (error) {
        showToast(t('fc-favs-load-error'), 'danger');
        return [];
    }
}