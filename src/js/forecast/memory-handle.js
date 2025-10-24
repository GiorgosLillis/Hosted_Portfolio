import { checkAuth } from "../common/getcookie.js";
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';
import { showToast } from '../common/toast.js';

loadRecaptchaScript();

const cityListKey = 'favoriteLocations';

export async function saveCityList(cityList) {
    localStorage.setItem(cityListKey, JSON.stringify(cityList));

    try {
        const user = await checkAuth();
        if (!user) {
            showToast('Favorites saved to local storage.', 'success');
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
            body: JSON.stringify({ list: cityList })
        });

        if (!response.ok) {
            showToast('Failed to sync favorites with server.', 'danger');
            return { success: false };
        }

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
            const list = localStorage.getItem(cityListKey);
            showToast('Not authenticated. Local saved favorites shown.', 'info');
            return JSON.parse(list) || [];
        }

        const localList = localStorage.getItem(cityListKey);
        if (localList) {
            showToast('Favorites loaded from server.', 'success');
            return JSON.parse(localList);
        }

        showToast('Loading favorites from server...', 'info');
        const response = await fetch(`/api/cities`);
        if (!response.ok) {
            showToast('Could not fetch favorites from server.', 'danger');
            return [];
        }
        const data = await response.json();
        localStorage.setItem(cityListKey, JSON.stringify(data.list));
        showToast('Favorites loaded from server.', 'success');
        return data.list;
    } catch (error) {
        showToast('Error loading favorites.', 'danger');
        return [];
    }
}