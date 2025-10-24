import { updateItemNumbers, List, list_items, errorMessage, successMessage, clearMessages, confirmDelete, resetList, allButtons } from "./basic-controls-list.js";
import { checkAuth} from "../common/getcookie.js";
import { loadRecaptchaScript, getRecaptchaToken } from '../common/recaptcha.js';

loadRecaptchaScript();

const shoppingListKey = 'myShoppingList';
const loading = document.getElementById('loadingMessage');

function setButtonsDisabled(disabled) {
    allButtons.forEach(button => {
        button.disabled = disabled;
    });
}

export async function saveShoppingList() {

    setButtonsDisabled(true);
    loading.textContent = 'Wait for a moment';
    const list_items_dom = Array.from(list_items);
    clearMessages();

    // Populate the global shoppingList array from current DOM elements' data attributes
    const shoppingList = list_items_dom.map(li => {
        return {
            item: li.dataset.originalItem, // Always save the original casing
            id: li.dataset.id,
            quantity: li.dataset.quantity,
            unit: li.dataset.unit,
            category: li.dataset.category ? li.dataset.category : 'Other',
            check: li.dataset.checked
        };
    });

    try {
        const user = await checkAuth();
        if (user && shoppingList && shoppingList.length > 0) {
            const token = await getRecaptchaToken('save_list');
            const data = JSON.stringify({ id: user.id, list: shoppingList });
            const response = await fetch('/api/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'g-recaptcha-response': token
                },
                body: data
            });

            if(response.ok){
                successMessage.textContent = 'Saved shopping list to server!';
            }
            else{
                const result = await response.json();
                errorMessage.textContent = result.message || 'Error saving shopping list to server!';
            }
        }
        else if(shoppingList.length === 0){
            errorMessage.textContent = 'Cannot save an empty list';
        }
        else{
            errorMessage.textContent = 'You are not logged in';
        }
    } catch (error) {
        console.error('Error saving shopping list to server:', error);
        errorMessage.textContent = 'Error saving shopping list to server!';
    } finally {
        loading.textContent = '';
        setButtonsDisabled(false);
    }
}

export async function deleteList(){

    setButtonsDisabled(true);
    clearMessages();
    let button = document.getElementById('confirmDeleteBtn');
    button.removeEventListener('click', () => deleteList());
    button.id = 'deleteBtn';
    button.textContent = 'Delete';
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

            if(response.ok){
                localStorage.removeItem(shoppingListKey);
                resetList();
            }
            else{
                const result = await response.json();
                errorMessage.textContent = result.message || 'Error deleting shopping list!';
            }
        }
        else{
            errorMessage.textContent = 'You are not logged in';
        }
    } catch (error) {
        console.error('Error deleting shopping list:', error);
        errorMessage.textContent = 'Error deleting shopping list!'
    } finally {
        loading.textContent = '';
        setButtonsDisabled(false);
    }
}

export function loadShoppingList() {
    setButtonsDisabled(true);
    const logStatus = document.getElementById('logStatus');
    clearMessages();

    const renderFromLocalStorage = () => {
        const storedList = localStorage.getItem(shoppingListKey);
        if (storedList) {
            const shoppingList = JSON.parse(storedList);
            List.innerHTML = ''; // Clear existing list
            shoppingList.forEach(item => {
                const listItem = document.createElement('li');
                listItem.className = 'list-group-item fs-5 mb-3 rounded-3';
                listItem.dataset.originalItem = item.name;
                listItem.dataset.item = item.name.toUpperCase();
                listItem.dataset.quantity = item.quantity;
                listItem.dataset.unit = item.measure;
                listItem.dataset.category = item.category || 'Other';
                listItem.dataset.checked = item.isPurchased ? 'true' : 'false';
                List.append(listItem);
            });
            updateItemNumbers();
            successMessage.textContent = 'Loaded shopping list from local storage!';
        }
    };

    checkAuth().then(user => {
        if (user) {
            logStatus.textContent = "Hello " + user.first_name + ' ' + user.last_name;
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
                        localStorage.setItem(shoppingListKey, JSON.stringify(list));
                        successMessage.textContent = 'Loaded shopping list from server!';
                    } else {
                        localStorage.removeItem(shoppingListKey); // Remove local list if server has none
                        errorMessage.textContent = "You don't have a saved list on the server.";
                    }
                    renderFromLocalStorage(); // Render from local storage in any case
                })
                .catch(error => {
                    console.error('Error loading shopping list from server:', error);
                    errorMessage.textContent = 'Error loading from server. Trying local storage.';
                    renderFromLocalStorage();
                })
                .finally(() => {
                    setButtonsDisabled(false);
                });
        } else {
            errorMessage.textContent = 'Not logged in. Loading from local storage.';
            renderFromLocalStorage();
            setButtonsDisabled(false);
        }
    });
}