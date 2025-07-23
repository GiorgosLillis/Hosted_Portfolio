// Define a global shoppingList array to hold your data for persistence.
// This array will be synced with the DOM only on load and unload.
let shoppingList = [];

function inputValidation(item, quantity, unit, errorMessage){
    // Validation for 'item'
    if (item.length < 2) {
        errorMessage.textContent = "Write an item.";
        return false;
    }
    if (!/[a-zA-Z]/.test(item)) {
      errorMessage.textContent = "Item has no letters.";
      return false;
    }
    if (/(.)\1{3,}/.test(item)) { // Checks for 4 or more of the same character in a row
        errorMessage.textContent = "Item has too many repeating characters.";
        return false;
    }

    // Validation for 'quantity'
    const parsedQuantity = parseFloat(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
        errorMessage.textContent = " Validation failed: Quantity must be a positive number.";
        return false;
    }

    // Units can be short (e.g., "kg", "pcs"), so minimum length might be 1 or 0 if optional
        if (unit.length < 1) {
            errorMessage.textContent = "Select a unit.";
            return false;
        }
        if (!/[a-zA-Z]/.test(unit)) {
           errorMessage.textContent = "Unit has no letters.";
            return false;
        }
        if (/(.)\1{3,}/.test(unit)) {
            errorMessage.textContent = "Unit has too many repeating characters.";
            return false;
        }

    return true;
}
// --------------------------------------------------------------------------------------------------
document.getElementById('submitBtn').addEventListener('click', saveList);
function saveList(e) {
  e.preventDefault();

  let list_el = document.getElementById('displayList');
  let list_items = Array.from(list_el.children); // Get all existing list items
  let errorMessage = document.getElementById('errorMessage');
  errorMessage.textContent = ''; // Clear any previous error messages

  let itemInput = document.getElementById('item'); // Renamed 'item' to 'itemInput' to avoid conflict
  let quantityInput = document.getElementById('quantity'); // Renamed 'quantity' to 'quantityInput'
  let unitInput = document.getElementById('unit'); // Renamed 'unit' to 'unitInput'

  const itemValue = itemInput.value.trim();
  const quantityValue = quantityInput.value.trim();
  const unitValue = unitInput.value.trim();

  if (!inputValidation(itemValue, quantityValue, unitValue, errorMessage)) {
    itemInput.focus(); // Corrected: use itemInput here
    return;
  }

  const newItemTextUppercase = itemValue.toUpperCase(); // Uppercase for case-insensitive duplicate check
  const isDuplicate = list_items.some(listItem => {
      // Check the data-item attribute (which stores the uppercase version) for duplicates
      return listItem.dataset.item === newItemTextUppercase;
  });

 if (isDuplicate) {
    errorMessage.textContent = 'Item already exists in the list';
    itemInput.value = ''; // Corrected: use itemInput.value here
    itemInput.focus();
    return;
  }

  let listItem = document.createElement('li');
  listItem.className = 'list-group-item fs-5 mb-3 rounded-3';

  // Store data attributes:
  // data-item for uppercase (for duplicate checks)
  // data-original-item for original casing (for display and saving)
  listItem.dataset.item = newItemTextUppercase;
  listItem.dataset.originalItem = itemValue;
  listItem.dataset.quantity = quantityValue;
  listItem.dataset.unit = unitValue;

  // Add new item to the TOP of the list in the DOM
  list_el.append(listItem);
  updateItemNumbers(); // This will properly format the display content

  itemInput.value = '';
  quantityInput.value = '';
  unitInput.value = '';
  itemInput.focus(); // Set focus back to the input field
}
// --------------------------------------------------------------------------------------------------
function updateItemNumbers() {
  let list_el = document.getElementById('displayList');
  let list_items = Array.from(list_el.children);

  for (let i = 0; i < list_items.length; i++) {
    const listItem = list_items[i];

    // Retrieve data from dataset attributes, using original casing for display
    const itemText = listItem.dataset.originalItem;
    const quantity = listItem.dataset.quantity;
    const unit = listItem.dataset.unit;

    // Construct the display content for the list item (no uppercase for display)
    let displayContent = `${itemText} ${quantity}${unit}`.trim();

    listItem.className = 'list-group-item fs-5 mb-3 rounded-3';

    // Set the innerHTML for the list item, including the number and constructed content
    listItem.innerHTML = `
      ${i+1}. ${displayContent}
    `;

    // Re-append the remove button
    const removeBtn = createBtn();
    listItem.appendChild(removeBtn);
  }
}
// --------------------------------------------------------------------------------------------------
function createBtn() {
  let btn = document.createElement('button');
  btn.innerHTML = '<i class="bi bi-trash"></i>';
  btn.className = 'btn btn-danger btn-sm float-end ms-2';
  btn.onclick = function() {
      this.parentElement.remove(); // Remove the <li> element from the DOM
      updateItemNumbers(); // Re-number the remaining items
    };
  return btn;
}

document.getElementById('resetBtn').addEventListener('click', resetList);
function resetList() {
  let list_el = document.getElementById('displayList');
  list_el.innerHTML = ''; // Clear all items from the DOM
  document.getElementById('errorMessage').textContent = '';
  document.getElementById('item').value = '';
  document.getElementById('quantity').value = ''; // Clear quantity input
  document.getElementById('unit').value = '';     // Clear unit input
  document.getElementById('item').focus(); // Set focus back to item input
}

document.getElementById('downloadBtn').addEventListener('click', verify);
function verify() {
  let list_el = document.getElementById('displayList');
  let list_items = Array.from(list_el.children);
  let errorMessage = document.getElementById('errorMessage');
  errorMessage.textContent = ''; // Clear any previous error messages

  if (list_items.length === 0) {
    errorMessage.textContent = 'List is empty. Please add items before downloading.';
    return;
  }

  let button = document.getElementById('downloadBtn');
  // Reset the button to its original state if it was "Confirm Download"
  if (button.id === 'confirmDownloadBtn') {
    button.removeEventListener('click', downloadList);
    button.id = 'downloadBtn'; // Reset ID
    button.textContent = 'Download List'; // Reset text
  }

  // Set up for confirmation
  button.id = 'confirmDownloadBtn';
  button.textContent = 'Confirm Download';
  button.removeEventListener('click', verify);
  button.addEventListener('click', downloadList); // Add the downloadList function as the new click handler
}
// --------------------------------------------------------------------------------------------------
function downloadList() {
  let list_el = document.getElementById('displayList');
  let list_items = Array.from(list_el.children);
  let errorMessage = document.getElementById('errorMessage');
  errorMessage.textContent = '';

  if (list_items.length === 0) {
    errorMessage.textContent = 'List is empty. Please add items before downloading.';
    return;
  }

  let textContent = list_items
    .map((li) => {
        const item = li.dataset.originalItem;
        const quantity = li.dataset.quantity;
        const unit = li.dataset.unit;
        return `${item} ${quantity}${unit}`.trim();
    })
    .filter(line => line !== '') // Filter out empty lines
    .join('\n');

  let blob = new Blob([textContent], { type: 'text/plain' });
  let url = URL.createObjectURL(blob);

  let a = document.createElement('a');
  a.href = url;
  a.download = 'list.txt';
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Reset download button
  let button = document.getElementById('confirmDownloadBtn');
  button.removeEventListener('click', downloadList);
  button.id = 'downloadBtn';
  button.textContent = 'Download List';
  button.addEventListener('click', verify); // Re-add the verify listener for next time
}
// --------------------------------------------------------------------------------------------------
document.getElementById('uploadBtn').addEventListener('click', uploadList);
async function uploadList(event) {
  event.preventDefault();

  let errorMessage = document.getElementById('errorMessage');
  errorMessage.textContent = '';
  try {
    const files = await showFileExplorer({
      accept: '.txt',
      multiple: false
    });

    if (files && files.length > 0) {
      await processUploadedFile(files[0]);
    } else {
      errorMessage.textContent = 'No file selected';
    }
  } catch (error) {
    errorMessage.textContent = `Error: ${error.message}`;
  }
}
// --------------------------------------------------------------------------------------------------
function showFileExplorer(options) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept || '';
    input.multiple = options.multiple || false;

    input.onchange = () => {
      if (input.files.length > 0) {
        resolve(Array.from(input.files));
      } else {
        reject(new Error('No files selected'));
      }
    };

    input.onerror = () => {
      reject(new Error('Error opening file explorer'));
    };

    input.click(); // Trigger the file selection dialog
  });
}
// --------------------------------------------------------------------------------------------------
async function processUploadedFile(file) {
  const errorMessage = document.getElementById('errorMessage');
  errorMessage.textContent = '';
  if (!file || file.type !== 'text/plain') {
    errorMessage.textContent = 'Please upload a valid text file';
    return;
  }

  // Update info display
  const fileInfo = document.getElementById('fileInfo');
  fileInfo.textContent = '';
  fileInfo.className = 'alert alert-info fs-5';
  fileInfo.innerHTML = `<strong>Selected file:</strong> ${file.name}`;
  fileInfo.innerHTML += `<br><strong>File size:</strong> ${formatFileSize(file.size)}`;

  // Read file content
  try {
    const fileContent = await readFileAsText(file);
    const lines = fileContent.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      errorMessage.textContent = 'File is empty or contains no valid items';
      return;
    }

    // Clear existing list from DOM
    resetList(); // This clears the DOM

    const list_el = document.getElementById('displayList');

    // Add items from file directly to the DOM, setting data attributes
    lines.forEach(itemTextLine => {
      const listItem = document.createElement('li');
      listItem.className = 'list-group-item fs-5 mb-3 rounded-3';

      // Attempt to parse the line into item, quantity, unit for data attributes
      // Assuming format like "ITEM QUANTITYUNIT" or just "ITEM"
      const match = itemTextLine.trim().match(/^([A-Za-z\s]+)\s*(\d+(\.\d+)?)\s*([A-Za-z]+)?$/i); // Case-insensitive match
      if (match) {
          const item = match[1].trim();
          const quantity = match[2] || '';
          const unit = match[4] || '';
          listItem.dataset.item = item.toUpperCase(); // Store uppercased for comparison
          listItem.dataset.originalItem = item; // Store original for display and saving
          listItem.dataset.quantity = quantity;
          listItem.dataset.unit = unit;
          listItem.textContent = `${item} ${quantity}${unit}`.trim(); // Initial display using original casing
      } else {
          errorMessage.textContent = `Invalid format in line: "${itemTextLine}". Expected format: "ITEM QUANTITYUNIT"`;
          return; //Skip line
      }
      list_el.append(listItem); // Add to DOM
    });

    updateItemNumbers(); // Update numbering and add buttons for newly loaded DOM items
    fileInfo.innerHTML = `<strong>Selected file:</strong> ${file.name} (Loaded)`; // Update status
  } catch (error) {
    errorMessage.textContent = `Error reading file: ${error.message}`;
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = error => reject(error);
    reader.readAsText(file);
  });
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


function saveShoppingListToLocalStorage() {
    const list_el = document.getElementById('displayList');
    const list_items_in_dom = Array.from(list_el.children);

    // Populate the global shoppingList array from current DOM elements' data attributes
    shoppingList = list_items_in_dom.map(li => {
        return {
            item: li.dataset.originalItem, // Always save the original casing
            quantity: li.dataset.quantity,
            unit: li.dataset.unit
        };
    });

    localStorage.setItem('myShoppingList', JSON.stringify(shoppingList));
    console.log('Shopping list saved to local storage upon closing.');
}

function loadShoppingListFromLocalStorage() {
    const storedList = localStorage.getItem('myShoppingList');
    const list_el = document.getElementById('displayList');

    if (storedList) {
        shoppingList = JSON.parse(storedList);
        console.log('Shopping list loaded from local storage:', shoppingList);

        // Clear existing DOM before rendering
        list_el.innerHTML = '';

        // Render each item from the loaded shoppingList array to the DOM
        for (let i = 0; i < shoppingList.length; i++) {
            const itemData = shoppingList[i];
            let listItem = document.createElement('li');
            listItem.className = 'list-group-item fs-5 mb-3 rounded-3';

            // Set data attributes from the loaded data
            listItem.dataset.item = itemData.item.toUpperCase(); // Uppercased for duplicate check
            listItem.dataset.originalItem = itemData.item; // Original casing for display and saving
            listItem.dataset.quantity = itemData.quantity;
            listItem.dataset.unit = itemData.unit;

            // Construct display content using original casing
            let displayContent = itemData.item;
            if (itemData.quantity && itemData.unit) {
                displayContent += ` ${itemData.quantity}${itemData.unit}`;
            } else if (itemData.quantity) {
                displayContent += ` ${itemData.quantity}`;
            } else if (itemData.unit) {
                displayContent += ` ${itemData.unit}`;
            }

            listItem.textContent = displayContent; // Set initial text content using original casing
            list_el.appendChild(listItem); // Append to the DOM
        }
        updateItemNumbers(); // Apply numbering and add buttons to loaded DOM elements
    } else {
        console.log('No shopping list found in local storage. Starting with an empty list.');
        shoppingList = []; // Ensure shoppingList is empty
        list_el.innerHTML = ''; // Ensure DOM is empty
    }
}
// --------------------------------------------------------------------------------------------------
// Event listener to save the list when the page is about to be unloaded
window.addEventListener('beforeunload', saveShoppingListToLocalStorage);

// Load the shopping list when the DOM content is fully loaded
document.addEventListener('DOMContentLoaded', loadShoppingListFromLocalStorage);