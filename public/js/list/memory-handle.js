function saveShoppingListToLocalStorage() {
    const list_items_dom = Array.from(list_items);

    // Populate the global shoppingList array from current DOM elements' data attributes
    shoppingList = list_items_dom.map(li => {
        return {
            item: li.dataset.originalItem, // Always save the original casing
            quantity: li.dataset.quantity,
            unit: li.dataset.unit,
            category: li.dataset.category
        };
    });

    localStorage.setItem('myShoppingList', JSON.stringify(shoppingList));
    console.log('Shopping list saved to local storage upon closing.');
}

function loadShoppingListFromLocalStorage() {
    const storedListJSON = localStorage.getItem('myShoppingList');

    if (storedListJSON) {
        try {
            const storedList = JSON.parse(storedListJSON); // Parse directly into a local variable
            console.log('Shopping list loaded from local storage.');

   
            List.innerHTML = ''; 
            storedList.forEach(itemData => {
                let listItem = document.createElement('li');
                listItem.className = 'list-group-item fs-5 mb-3 rounded-3';

                listItem.dataset.item = itemData.item.toUpperCase(); 
                listItem.dataset.originalItem = itemData.item; 
                listItem.dataset.quantity = itemData.quantity;
                listItem.dataset.unit = itemData.unit;
                listItem.dataset.category = itemData.category || 'Other';
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
        List.innerHTML = ''; y
    }
}

// Event listener to save the list when the page is about to be unloaded
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveShoppingListToLocalStorage();
  }
});

// Fallback
window.addEventListener('beforeunload', saveShoppingListToLocalStorage);

// Load the shopping list when the DOM content is fully loaded
document.addEventListener('DOMContentLoaded', loadShoppingListFromLocalStorage);