import { updateItemNumbers, List, list_items, errorMessage, successMessage, clearMessages, confirmDelete, resetList, allButtons } from "./basic-controls-list.js";
import { checkAuth } from "../common/getcookie.js";
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';

loadRecaptchaScript();

// Local-only store vs the account's server-synced store
const LOCAL_SHOPPING_KEY = 'localShoppingList';
const ACCOUNT_SHOPPING_KEY = 'accountShoppingList';
const loading = document.getElementById('loadingMessage');

// Items removed since the last save 
let removedItemNames = [];

export function trackRemovedItem(name) {
    removedItemNames.push(name);
}

function setButtonsDisabled(disabled) {
    allButtons.forEach(button => {
        button.disabled = disabled;
    });
}

// Reads the current DOM list and syncs it to the server
export async function saveShoppingList() {

    setButtonsDisabled(true);
    loading.textContent = 'Wait for a moment';
    const list_items_dom = Array.from(list_items);
    clearMessages();

    const shoppingList = list_items_dom.map(li => {
        const itemData = {
            item: li.dataset.originalItem, // Original casing
            id: parseInt(li.dataset.id), // Parse id as integer
            quantity: li.dataset.quantity,
            unit: li.dataset.unit,
            category: li.dataset.category ? li.dataset.category : 'Other',
            check: li.dataset.checked
        };
        if (li.dataset.itemId) {
            itemData.itemId = parseInt(li.dataset.itemId);
        }
        return itemData;
    });

    const toRenderShape = (items) => items.map(item => ({
        name: item.item,
        quantity: item.quantity,
        measure: item.unit,
        category: item.category,
        isPurchased: item.check === 'true',
        itemId: item.itemId
    }));

    try {
        if (shoppingList.length === 0) {
            errorMessage.textContent = 'Cannot save an empty list';
            return;
        }

        const user = await checkAuth();
        if (!user) {
            localStorage.setItem(LOCAL_SHOPPING_KEY, JSON.stringify(toRenderShape(shoppingList)));
            successMessage.textContent = 'Saved on this device only. Log in or register to save your list to your account and access it everywhere.';
            return;
        }

        const token = await getRecaptchaToken('save_list');
        const data = JSON.stringify({ id: user.id, list: shoppingList, removed: removedItemNames });
        const response = await fetch('/api/list', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'g-recaptcha-response': token
            },
            body: data
        });

        if (response.ok) {
            // Keep the account's local cache in sync with server
            localStorage.setItem(ACCOUNT_SHOPPING_KEY, JSON.stringify(toRenderShape(shoppingList)));
            successMessage.textContent = 'Saved shopping list to server!';
            removedItemNames = [];
        }
        else {
            const result = await response.json();
            errorMessage.textContent = result.message || 'Error saving shopping list to server!';
        }
    } catch (error) {
        console.error('Error saving shopping list to server:', error);
        errorMessage.textContent = 'Error saving shopping list to server!';
    } finally {
        loading.textContent = '';
        setButtonsDisabled(false);
    }
}

// Wipes the shopping list on the server and clears the local copy
export async function deleteList() {

    setButtonsDisabled(true);
    clearMessages();
    let button = document.getElementById('confirmDeleteBtn');
    button.removeEventListener('click', () => deleteList());
    button.id = 'deleteBtn';
    button.textContent = 'Delete';
    button.setAttribute('aria-label', 'Delete all items on your profile');
    button.addEventListener('click', confirmDelete);

    try {
        const user = await checkAuth();
        if (user) {
            loading.textContent = 'Wait for a moment';
            const token = await getRecaptchaToken('delete_list');
            const response = await fetch('/api/list', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'g-recaptcha-response': token
                },
                body: JSON.stringify({ id: user.id })
            });

            if (response.ok) {
                localStorage.removeItem(ACCOUNT_SHOPPING_KEY);
                removedItemNames = [];
                resetList();
            }
            else {
                const result = await response.json();
                errorMessage.textContent = result.message || 'Error deleting shopping list!';
            }
        }
        else {
            errorMessage.textContent = 'Log in or register to save and manage a shopping list on your account.';
        }
    } catch (error) {
        console.error('Error deleting shopping list:', error);
        errorMessage.textContent = 'Error deleting shopping list!'
    } finally {
        loading.textContent = '';
        setButtonsDisabled(false);
    }
}

// Runs on page load, if logged in pulls the list from the server 
// otherwise just renders whatever is already in localStorage
export function loadShoppingList() {
    setButtonsDisabled(true);
    const logStatus = document.getElementById('logStatus');
    clearMessages();

    const renderFromLocalStorage = (key) => {
        const storedList = localStorage.getItem(key);
        if (storedList) {
            const shoppingList = JSON.parse(storedList);
            List.innerHTML = '';
            shoppingList.forEach(item => {
                const listItem = document.createElement('li');
                listItem.className = 'list-group-item fs-5 mb-3 rounded-3';
                listItem.dataset.originalItem = item.name;
                listItem.dataset.item = item.name.toUpperCase();
                listItem.dataset.quantity = item.quantity;
                listItem.dataset.unit = item.measure;
                listItem.dataset.category = item.category || 'Other';
                listItem.dataset.checked = item.isPurchased ? 'true' : 'false';
                if (item.itemId) {
                    listItem.dataset.itemId = item.itemId;
                }
                List.append(listItem);
            });
            updateItemNumbers();
            successMessage.textContent = 'Loaded shopping list from local storage!';
        }
    };

    checkAuth().then(user => {
        if (user) {
            logStatus.textContent = "Hello " + user.firstName + ' ' + user.lastName;
            fetch(`/api/list?id=${user.id}`)
                .then(res => {
                    if (!res.ok) {
                        throw new Error('Server response was not ok.');
                    }
                    return res.json();
                })
                .then(data => {
                    const list = data.list;
                    if (list && list.length > 0) {
                        localStorage.setItem(ACCOUNT_SHOPPING_KEY, JSON.stringify(list));
                        successMessage.textContent = 'Loaded shopping list from server!';
                    } else {
                        localStorage.removeItem(ACCOUNT_SHOPPING_KEY);
                        errorMessage.textContent = "You don't have a saved list on the server.";
                    }
                    renderFromLocalStorage(ACCOUNT_SHOPPING_KEY);
                })
                .catch(error => {
                    console.error('Error loading shopping list from server:', error);
                    errorMessage.textContent = 'Error loading from server. Trying local storage.';
                    renderFromLocalStorage(ACCOUNT_SHOPPING_KEY);
                })
                .finally(() => {
                    setButtonsDisabled(false);
                });
        } else {
            errorMessage.textContent = 'Showing your list saved on this device. Log in or register to save it to your account and access it everywhere.';
            renderFromLocalStorage(LOCAL_SHOPPING_KEY);
            setButtonsDisabled(false);
        }
    });
}