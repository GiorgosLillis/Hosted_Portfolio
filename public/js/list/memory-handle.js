import { updateItemNumbers, List, list_items } from "/js/basic-controls-list.js";

export function saveShoppingListToLocalStorage() {
    const list_items_dom = Array.from(list_items);

    // Populate the global shoppingList array from current DOM elements' data attributes
    const shoppingList = list_items_dom.map(li => {
        return {
            item: li.dataset.originalItem, // Always save the original casing
            quantity: li.dataset.quantity,
            unit: li.dataset.unit,
            category: li.dataset.category,
            check: li.dataset.checked
        };
    });

    localStorage.setItem('myShoppingList', JSON.stringify(shoppingList));
}

export function loadShoppingListFromLocalStorage() {
    const storedListJSON = localStorage.getItem('myShoppingList');

    if (storedListJSON) {
        try {
            const storedList = JSON.parse(storedListJSON); // Parse directly into a local variable

            List.innerHTML = '';
            storedList.forEach(itemData => {
                let listItem = document.createElement('li');
                listItem.className = 'list-group-item fs-5 mb-3 rounded-3';
                listItem.dataset.item = itemData.item.toUpperCase();
                listItem.dataset.originalItem = itemData.item;
                listItem.dataset.quantity = itemData.quantity;
                listItem.dataset.unit = itemData.unit;
                listItem.dataset.category = itemData.category || 'Other';
                listItem.dataset.checked = itemData.check; // Ensure boolean is stored as string
                List.appendChild(listItem);
            });
            updateItemNumbers();
        } catch (e) {
            console.error('Error parsing shopping list from localStorage:', e);
            localStorage.removeItem('myShoppingList');
            List.innerHTML = '';
        }
    } else {
        console.log('No shopping list found in local storage. Starting with an empty list.');
        List.innerHTML = '';
    }
}

