import { addDragAndDropListeners } from "./list-features.js";
import { saveShoppingList, loadShoppingList, deleteList} from "./memory-handle.js";

export const List = document.getElementById('displayList');
export const list_items = List.children;
export const itemInput = document.getElementById('item');
export const quantityInput = document.getElementById('quantity');
export const unitInput = document.getElementById('unit');
export const categoryInput = document.getElementById('category');
export const filterCategoryBtn = document.getElementById('filterCategory');
export const filterNameBtn = document.getElementById('filterName');
export const joinfilterBtn = document.getElementById('filterAll');
export const successMessage = document.getElementById('successMessage');
export const errorMessage = document.getElementById('errorMessage');
export const fileInfo = document.getElementById('fileInfo');
export const submitBtn = document.getElementById('submitBtn');
export const resetBtn = document.getElementById('resetBtn');
export const downloadBtn = document.getElementById('downloadBtn');
export const uploadBtn = document.getElementById('uploadBtn');
export const saveBtn = document.getElementById('saveBtn');
export const deleteBtn = document.getElementById('deleteBtn');
export const allButtons = [submitBtn, resetBtn, downloadBtn, uploadBtn, saveBtn, deleteBtn, filterCategoryBtn, filterNameBtn, joinfilterBtn];


function inputValidation(item, quantity, unit, errorMessage) {
  errorMessage.textContent = ''; // Clear previous error messages

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
    errorMessage.textContent = "Quantity must be a positive number.";
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

export function clearMessages() {
  successMessage.textContent = '';
  errorMessage.textContent = '';
  fileInfo.textContent = '';
  fileInfo.className = '';
}


submitBtn.addEventListener('click', addToList);
function addToList(e) {
  e.preventDefault();

  clearMessages();

  const itemValue = itemInput.value.trim();
  const quantityValue = quantityInput.value.trim();
  const unitValue = unitInput.value.trim();
  const categoryValue = categoryInput.value.trim() || 'Other';

  if (!inputValidation(itemValue, quantityValue, unitValue, errorMessage)) {
    return;
  }

  let list_items_dom = Array.from(list_items);
  const newItemTextUppercase = itemValue.toUpperCase();
  const isDuplicate = list_items_dom.some(listItem => {
    return listItem.dataset.item === newItemTextUppercase;
  });

  if (isDuplicate) {
    errorMessage.textContent = 'Item already exists in the list';
    itemInput.value = '';
    return;
  }

  let listItem = document.createElement('li');
  listItem.className = 'list-group-item fs-5 mb-3 rounded-3';
  listItem.dataset.item = newItemTextUppercase;
  listItem.dataset.originalItem = itemValue;
  listItem.dataset.quantity = quantityValue;
  listItem.dataset.unit = unitValue;
  listItem.dataset.category = categoryValue;
  List.append(listItem);
  updateItemNumbers();

  itemInput.value = '';
  quantityInput.value = '';
  unitInput.value = '';
  if (window.innerWidth >= 768) { // Only focus on desktop/tablet
    itemInput.focus();
  }
}

export function updateItemNumbers() {

  for (let i = 0; i < list_items.length; i++) {
    const listItem = list_items[i];

    const id = i + 1;
    listItem.dataset.id = id; // Store the id in the dataset
    const itemText = listItem.dataset.originalItem;
    const quantity = listItem.dataset.quantity;
    const unit = listItem.dataset.unit;
    const category = listItem.dataset.category || 'Other';
    const check = listItem.dataset.checked;

    let displayContent = `${id}) ${category}: ${itemText} ${quantity}${unit}`.trim();
    listItem.innerHTML = displayContent;

    listItem.draggable = "true";
    const removeBtn = createBtn();
    listItem.appendChild(removeBtn);
    let checkBox = document.createElement('input');
    checkBox.type = 'checkbox';
    checkBox.id = 'gotItem' + (i + 1);
    checkBox.className = 'form-check-input mx-2 float-end'
    checkBox.checked = (check === 'true');
    checkBox.onclick = function (_) {
      this.parentElement.dataset.checked = this.checked;
      return this.parentElement.ariaLabel = `${i + 1}. Category: ${category} Item:${itemText}, Quantity: ${quantity}${unit}, checkbox: ${this.checked ? 'checked' : 'not checked'}`;
    }
    listItem.appendChild(checkBox);
    listItem.ariaLabel = `${i + 1}. Category: ${category} Item:${itemText}, Quantity: ${quantity}${unit}, checkbox: ${checkBox.checked ? 'checked' : 'not checked'}`;
    addDragAndDropListeners(listItem);
  }
}

function createBtn() {
  let btn = document.createElement('button');
  btn.innerHTML = '<i class="bi bi-trash"></i>';
  btn.className = 'btn btn-danger btn-sm float-end ms-2';
  btn.ariaLabel = 'Delete this item';
  btn.onclick = function () {
    this.parentElement.remove();
    clearMessages();
    updateItemNumbers();
  };
  return btn;
}

resetBtn.addEventListener('click', resetList);
export function resetList() {
  clearMessages();
  List.innerHTML = '';
  document.getElementById('errorMessage').textContent = '';
  document.getElementById('item').value = '';
  document.getElementById('quantity').value = '';
  document.getElementById('unit').value = '';
  document.getElementById('item').focus();
}

downloadBtn.addEventListener('click', verify);
function verify() {

  clearMessages();

  if (list_items.length === 0) {
    errorMessage.textContent = 'List is empty. Please add items before downloading.';
    return;
  }

  let button = document.getElementById('downloadBtn');
  button.id = 'confirmDownloadBtn';
  button.textContent = 'Confirm Download';
  button.removeEventListener('click', verify);
  button.addEventListener('click', downloadList);
}

function downloadList() {

  let list_items_dom = Array.from(list_items);
  clearMessages();

  if (list_items.length === 0) {
    errorMessage.textContent = 'List is empty. Please add items before downloading.';
  }
  else {
    let textContent = list_items_dom
      .map((li) => {
        const category = li.dataset.category;
        const item = li.dataset.originalItem;
        const quantity = li.dataset.quantity;
        const unit = li.dataset.unit;
        const checked = (li.dataset.checked === 'true') ? 'Got it!' : '';
        return `${category} ${item} ${quantity}${unit} ${checked}`.trim();
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
  }

  let button = document.getElementById('confirmDownloadBtn');
  button.removeEventListener('click', downloadList);
  button.id = 'downloadBtn';
  button.textContent = 'Download';
  button.addEventListener('click', verify);
}

uploadBtn.addEventListener('click', uploadList);
async function uploadList(e) {
  e.preventDefault();

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

  resetList();

  errorMessage.textContent = '';
  if (!file || file.type !== 'text/plain') {
    errorMessage.textContent = 'Please upload a valid text file';
    return;
  }

  // Update info display
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

    // Add items from file directly to the list, setting data attributes  
    lines.forEach(itemTextLine => {
      const listItem = document.createElement('li');
      listItem.className = 'list-group-item fs-5 mb-3 rounded-3';
      
      // Regex for "CATEGORY ITEM QUANTITY UNIT Got it!"
      const match = itemTextLine.match(/^([A-Za-z]+)\s+([A-Za-z\s]+?)\s*(\d+(\.\d+)?)\s*([A-Za-z]+)?\s*(Got it!)?$/i);

      if (match) {
        const category = match[1].trim();
        const item = match[2].trim();
        const quantity = match[3] || '';
        const unit = match[5] || '';
        const isChecked = !!match[6];

        listItem.dataset.originalItem = item;
        listItem.dataset.item = item.toUpperCase();
        listItem.dataset.quantity = quantity;
        listItem.dataset.unit = unit;
        listItem.dataset.category = category;
        listItem.dataset.checked = isChecked;

      } else {
        // Fallback for old format "ITEM QUANTITY UNIT"
        const oldMatch = itemTextLine.match(/^([A-Za-z\s]+)\s*(\d+(\.\d+)?)\s*([A-Za-z]+)?\s*(Got it!)?$/i);
        if (oldMatch) {
            const item = oldMatch[1].trim();
            const quantity = oldMatch[2] || '';
            const unit = oldMatch[4] || '';
            const isChecked = !!oldMatch[5];

            listItem.dataset.originalItem = item;
            listItem.dataset.item = item.toUpperCase();
            listItem.dataset.quantity = quantity;
            listItem.dataset.unit = unit;
            listItem.dataset.category = 'Other'; // Default category
            listItem.dataset.checked = isChecked;
        } else {
            errorMessage.textContent = `Invalid format in line: "${itemTextLine}".`;
            return; //Skip line
        }
      }
      List.append(listItem); // Add to DOM
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

/* LIST FILTERING LOGIC */
filterCategoryBtn.addEventListener('click', filterListByCategory);
function filterListByCategory() {
  const selectedCategory = categoryInput.value;
  const listItems = Array.from(list_items);

  listItems.forEach(listItem => {
    listItem.style.display = '';
  })

  if (selectedCategory === '') {
    return;
  }

  listItems.forEach(listItem => {
    const itemCategory = listItem.dataset.category;
    if (itemCategory === selectedCategory) {
      listItem.style.display = '';
    } else {
      listItem.style.display = 'none';
    }
  });
  successMessage.textContent = 'Items within this category!';
}

filterNameBtn.addEventListener('click', filterListByName);
function filterListByName() {
  const listItems = Array.from(list_items);
  const item = itemInput.value.trim();
  successMessage.textContent = '';

  listItems.forEach(listItem => {
    listItem.style.display = '';
  });

  if (item === '') {
    return;
  }

  listItems.forEach(listItem => {
    const ItemUppercase = item.toUpperCase();
    if (listItem.dataset.item === ItemUppercase) {
      listItem.style.display = '';
    }
    else {
      listItem.style.display = 'none';
    }
  })
  successMessage.textContent = 'Items with this name!';
}

joinfilterBtn.addEventListener('click', joinFilter);
function joinFilter() {
  const listItems = Array.from(list_items);
  const selectedCategory = categoryInput.value;
  const item = itemInput.value.trim();

  listItems.forEach(listItem => {
    listItem.style.display = '';
  });

  if (item === '' || selectedCategory === '') {
    return;
  }

  listItems.forEach(listItem => {
    const ItemUppercase = item.toUpperCase();
    const itemCategory = listItem.dataset.category;
    if (listItem.dataset.item === ItemUppercase && itemCategory === selectedCategory) {
      listItem.style.display = '';
    }
    else {
      listItem.style.display = 'none';
    }
  });
  successMessage.textContent = 'Items that match all filters!';
}

saveBtn.addEventListener('click', () => saveShoppingList());
deleteBtn.addEventListener('click', confirmDelete);
export function confirmDelete(){
  clearMessages();

  let button = deleteBtn;
  button.id = 'confirmDeleteBtn';
  button.textContent = 'Confirm Delete';
  button.removeEventListener('click', verify);
  button.addEventListener('click', () => deleteList());

}


// Load the shopping list when the DOM content is fully loaded
document.addEventListener('DOMContentLoaded', loadShoppingList);