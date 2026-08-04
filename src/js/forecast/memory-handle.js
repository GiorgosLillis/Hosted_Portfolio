import { checkAuth } from "../common/getcookie.js";
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { showToast } from '../common/toast.js';

loadRecaptchaScript();

// Local-only store vs the account's server-synced store 
const LOCAL_FAVORITES_KEY = 'localFavoriteLocations';
const ACCOUNT_FAVORITES_KEY = 'accountFavoriteLocations';

export async function saveCityList(cityList, removedCities = []) {
    try {
        const user = await checkAuth();
        if (!user) {
            // Not authenticated (or offline, checkAuth can't tell the difference) - local-only,
            localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(cityList));
            showToast('Saved on this device only. Log in or register to save your favorites to your account and access them everywhere.', 'success');
            return { success: true };
        }

        showToast('Saving favorites to server...', 'info');
        const token = await getRecaptchaToken('save_city_list');
        const response = await fetch('/api/cities', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'g-recaptcha-response': token
            },
            body: JSON.stringify({ list: cityList, removed: removedCities })
        });

        if (!response.ok) {
            showToast('Failed to sync favorites with server.', 'danger');
            return { success: false };
        }

        localStorage.setItem(ACCOUNT_FAVORITES_KEY, JSON.stringify(cityList));
        showToast('Favorites saved and synced with server.', 'success');
        return { success: true };
    } catch (error) {
        showToast('Error syncing favorites.', 'danger');
        return { success: false };
    }
}

export async function loadCityList() {
    try {
        const user = await checkAuth();
        if (!user) {
            // Not authenticated (or offline) - only ever read the local-only store
            showToast('Showing favorites saved on this device. Log in or register to sync your favorites everywhere.', 'info');
            const localList = localStorage.getItem(LOCAL_FAVORITES_KEY);
            return JSON.parse(localList) || [];
        }

        showToast('Loading favorites from server...', 'info');
        const response = await fetch(`/api/cities`);
        if (!response.ok) {
            showToast('Could not fetch favorites from server.', 'danger');
            // Still authenticated, fall back to the last-known account cache
            const cachedAccountList = localStorage.getItem(ACCOUNT_FAVORITES_KEY);
            return JSON.parse(cachedAccountList) || [];
        }

        const data = await response.json();
        const list = data.list || [];
        localStorage.setItem(ACCOUNT_FAVORITES_KEY, JSON.stringify(list));
        showToast('Favorites loaded from server.', 'success');
        return list;
    } catch (error) {
        showToast('Error loading favorites.', 'danger');
        return [];
    }
}