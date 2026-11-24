import { addDragAndDropListeners } from "./list-features.js";
import { saveShoppingList, loadShoppingList, deleteList } from "./memory-handle.js";
import i18next from "../common/i18n.js";
import { setButtonMode } from "./button-mode.js";
import { toListCsv, parseListCsv, MAX_CSV_BYTES } from "./list-csv.js";
import { hasOnlyAllowedItemCharacters } from "../common/validation.js";

const t = (key, options) => i18next.t(key, options);

// Categories are stored in English (server + filters), only their displayed label is translated
const CATEGORY_KEYS = {
  'Produce': 'produce', 'Dairy': 'dairy', 'Meat': 'meat', 'Seafood': 'seafood', 'Bakery': 'bakery',
  'Pantry': 'pantry', 'Frozen': 'frozen', 'Beverages': 'beverages', 'Snacks': 'snacks',
  'Household': 'household', 'Personal Care': 'personal', 'Other': 'other',
};
const categoryLabel = (category) => CATEGORY_KEYS[category] ? t(CATEGORY_KEYS[category]) : category;

const MAX_ITEMS = 500;
const MAX_QUANTITY = 1000;

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


// Blocks obviously bad input (empty, no letters, keyboard-mash repeats) before adding a new item
function inputValidation(item, quantity, unit, errorMessage) {
  errorMessage.textContent = '';

  if (item.length < 2) {
    errorMessage.textContent = t('item-required');
    return false;
  }
  if (!/\p{L}/u.test(item)) {
    errorMessage.textContent = t('item-no-letters');
    return false;
  }
  if (/(.)\1{3,}/.test(item)) {
    errorMessage.textContent = t('item-repeating');
    return false;
  }
  if (!hasOnlyAllowedItemCharacters(item)) {
    errorMessage.textContent = t('item-special-chars');
    return false;
  }

  const parsedQuantity = parseFloat(quantity);
  if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
    errorMessage.textContent = t('quantity-invalid');
    return false;
  }
  if (parsedQuantity > MAX_QUANTITY) {
    errorMessage.textContent = t('quantity-too-large', { max: MAX_QUANTITY });
    return false;
  }

  if (unit.length < 1) {
    errorMessage.textContent = t('unit-required');
    return false;
  }
  if (!/\p{L}/u.test(unit)) {
    errorMessage.textContent = t('unit-no-letters');
    return false;
  }
  if (/(.)\1{3,}/.test(unit)) {
    errorMessage.textContent = t('unit-repeating');
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

  if (list_items.length >= MAX_ITEMS) {
    errorMessage.textContent = t('list-full', { max: MAX_ITEMS });
    return;
  }

  if (!inputValidation(itemValue, quantityValue, unitValue, errorMessage)) {
    return;
  }

  // Matching is case-insensitive, uppercase is what actually gets compared/stored in the dataset
  let list_items_dom = Array.from(list_items);
  const newItemTextUppercase = itemValue.toUpperCase();
  const isDuplicate = list_items_dom.some(listItem => {
    return listItem.dataset.item === newItemTextUppercase;
  });

  if (isDuplicate) {
    errorMessage.textContent = t('item-duplicate');
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
  if (window.innerWidth >= 768) {
    itemInput.focus();
  }
}

// Bold label followed by a value, built from nodes so a file name can never be parsed as HTML
function appendLabeled(parent, label, value) {
  const strong = document.createElement('strong');
  strong.textContent = label;
  parent.append(strong, ` ${value}`);
}

// Display-only, the stored casing (dataset.originalItem) is left untouched since it's
// what gets matched/saved against the server
function capitalizeFirst(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

// Re-renders every list item's numbering, text and checkbox, called after any add/remove/reorder
export function updateItemNumbers() {

  for (let i = 0; i < list_items.length; i++) {
    const listItem = list_items[i];

    const id = i + 1;
    listItem.dataset.id = id; // Store the id in the dataset
    const itemText = capitalizeFirst(listItem.dataset.originalItem);
    const quantity = listItem.dataset.quantity;
    const unit = listItem.dataset.unit;
    const category = listItem.dataset.category || 'Other';
    const check = listItem.dataset.checked;

    const itemLabel = (isChecked) => t('item-aria', {
      n: id, category: categoryLabel(category), item: itemText, quantity, unit,
      state: isChecked ? t('checked') : t('not-checked'),
    });
    let displayContent = `${id}) ${categoryLabel(category)}: ${itemText} ${quantity}${unit}`.trim();
    listItem.textContent = '';
    const textSpan = document.createElement('span');
    textSpan.className = 'item-text';
    textSpan.textContent = displayContent;
    listItem.appendChild(textSpan);
    listItem.draggable = "true";
    listItem.appendChild(createMoveButton(listItem, 'up'));
    listItem.appendChild(createMoveButton(listItem, 'down'));
    const removeBtn = createBtn();
    listItem.appendChild(removeBtn);
    let checkBox = document.createElement('input');
    checkBox.type = 'checkbox';
    checkBox.id = 'gotItem' + (i + 1);
    checkBox.className = 'form-check-input mx-2 float-end'
    checkBox.checked = (check === 'true');
    checkBox.setAttribute('aria-label', t('purchased-aria', { item: itemText }));
    checkBox.onclick = function (_) {
      this.parentElement.dataset.checked = this.checked;
      return this.parentElement.ariaLabel = itemLabel(this.checked);
    }
    listItem.appendChild(checkBox);
    listItem.ariaLabel = itemLabel(checkBox.checked);
    addDragAndDropListeners(listItem);
  }
}

function createMoveButton(listItem, direction) {
  const isUp = direction === 'up';
  const sibling = isUp ? listItem.previousElementSibling : listItem.nextElementSibling;

  const btn = document.createElement('button');
  btn.innerHTML = `<i class="bi bi-arrow-${isUp ? 'up' : 'down'}" aria-hidden="true"></i>`;
  btn.className = 'btn btn-secondary btn-sm float-end ms-2';
  btn.dataset.move = direction;
  btn.setAttribute('aria-label', isUp ? t('move-up-aria') : t('move-down-aria'));
  btn.disabled = !sibling;
  btn.onclick = function () {
    if (isUp) {
      List.insertBefore(listItem, listItem.previousElementSibling);
    } else {
      List.insertBefore(listItem.nextElementSibling, listItem);
    }
    clearMessages();
    updateItemNumbers();
    // Refocus the move button
    listItem.querySelector(`[data-move="${direction}"]`)?.focus();
  };
  return btn;
}

function createBtn() {
  let btn = document.createElement('button');
  btn.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i>';
  btn.className = 'btn btn-danger btn-sm float-end ms-2';
  btn.ariaLabel = t('delete-item-aria');
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
  setActiveFilter(null);
}

// Download requires a confirm click first, verify() swaps the button into "Confirm Download" mode
downloadBtn.addEventListener('click', verify);
function verify() {

  clearMessages();

  if (list_items.length === 0) {
    errorMessage.textContent = t('list-empty-download');
    return;
  }

  let button = document.getElementById('downloadBtn');
  button.id = 'confirmDownloadBtn';
  setButtonMode(button, 'confirm-download', 'confirm-download-aria');
  button.removeEventListener('click', verify);
  button.addEventListener('click', downloadList);
}

function downloadList() {

  let list_items_dom = Array.from(list_items);
  clearMessages();

  if (list_items.length === 0) {
    errorMessage.textContent = t('list-empty-download');
  }
  else {
    // The stored English category is written (not the translated label), so a download uploads again in any language
    const csv = toListCsv(list_items_dom.map((li) => ({
      category: li.dataset.category,
      item: li.dataset.originalItem,
      quantity: li.dataset.quantity,
      unit: li.dataset.unit,
      purchased: li.dataset.checked === 'true',
    })));

    let blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    let url = URL.createObjectURL(blob);

    let a = document.createElement('a');
    a.href = url;
    a.download = 'shopping-list.csv';
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  let button = document.getElementById('confirmDownloadBtn');
  button.removeEventListener('click', downloadList);
  button.id = 'downloadBtn';
  setButtonMode(button, 'download', 'download-aria');
  button.addEventListener('click', verify);
}

uploadBtn.addEventListener('click', uploadList);
async function uploadList(e) {
  e.preventDefault();

  errorMessage.textContent = '';
  try {
    const files = await showFileExplorer({
      accept: '.csv,text/csv',
      multiple: false
    });

    if (files && files.length > 0) {
      await processUploadedFile(files[0]);
    } else {
      errorMessage.textContent = t('no-file');
    }
  } catch (error) {
    errorMessage.textContent = t('error-generic', { message: error.message });
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

    input.click();
  });
}

// Adds the items of a CSV list (as downloaded from this page) to the current list. All or nothing: nothing is added unless
// every row is valid, so a file is never half loaded. Items already in the list are skipped, so uploading a file twice is harmless.
async function processUploadedFile(file) {
  clearMessages();
  // The extension is what the user chose; the type browsers report for CSV varies (text/csv, Excel's own, or none at all)
  if (!file || !/\.csv$/i.test(file.name)) {
    errorMessage.textContent = t('invalid-file');
    return;
  }
  // Checked before reading: 500 items fit in far less, a bigger file isn't a list from here
  if (file.size > MAX_CSV_BYTES) {
    errorMessage.textContent = t('file-too-big', { max: formatFileSize(MAX_CSV_BYTES) });
    return;
  }

  fileInfo.className = 'alert alert-info fs-5';
  appendLabeled(fileInfo, t('selected-file'), file.name);
  fileInfo.append(document.createElement('br'));
  appendLabeled(fileInfo, t('file-size'), formatFileSize(file.size));

  try {
    const result = parseListCsv(await readFileAsText(file));
    if (result.error) {
      errorMessage.textContent = t({ empty: 'file-empty', header: 'file-bad-header', format: 'file-bad-format' }[result.error]);
      return;
    }
    if (result.invalid.length > 0) {
      const shown = result.invalid.slice(0, 3)
        .map(({ line, text }) => `${line}: "${text.length > 40 ? `${text.slice(0, 40)}…` : text}"`)
        .join(', ') + (result.invalid.length > 3 ? ', …' : '');
      errorMessage.textContent = t('file-invalid-lines', { count: result.invalid.length, lines: shown });
      return;
    }

    // Same case-insensitive name rule as adding an item by hand
    const namesInList = new Set(Array.from(list_items, (li) => li.dataset.item));
    const items = result.items.filter((entry) => !namesInList.has(entry.item.toUpperCase()));
    const alreadyInList = result.items.length - items.length;

    if (list_items.length + items.length > MAX_ITEMS) {
      errorMessage.textContent = t('list-full', { max: MAX_ITEMS });
      return;
    }

    clearMessages();
    for (const item of items) {
      const listItem = document.createElement('li');
      listItem.className = 'list-group-item fs-5 mb-3 rounded-3';
      listItem.dataset.originalItem = item.item;
      listItem.dataset.item = item.item.toUpperCase();
      listItem.dataset.quantity = item.quantity;
      listItem.dataset.unit = item.unit;
      listItem.dataset.category = item.category;
      listItem.dataset.checked = item.purchased;
      List.append(listItem);
    }
    updateItemNumbers();

    fileInfo.className = 'alert alert-info fs-5';
    appendLabeled(fileInfo, t('selected-file'), `${file.name} ${t('loaded')}`);
    successMessage.textContent = t('file-items-added', { count: items.length })
      + (alreadyInList > 0 ? ` ${t('file-items-skipped', { count: alreadyInList })}` : '');
  } catch (error) {
    errorMessage.textContent = t('read-error', { message: error.message });
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
// Which filter is currently applied ('category' | 'name' | 'join' | null)
let activeFilter = null;

function setActiveFilter(filter) {
  activeFilter = filter;
  filterCategoryBtn.setAttribute('aria-pressed', String(filter === 'category'));
  filterNameBtn.setAttribute('aria-pressed', String(filter === 'name'));
  joinfilterBtn.setAttribute('aria-pressed', String(filter === 'join'));
}

filterCategoryBtn.addEventListener('click', filterListByCategory);
function filterListByCategory() {
  const selectedCategory = categoryInput.value;
  const listItems = Array.from(list_items);

  listItems.forEach(listItem => {
    listItem.style.display = '';
  })

  if (selectedCategory === '') {
    setActiveFilter(null);
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
  setActiveFilter('category');
  successMessage.textContent = t('filter-category-msg');
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
    setActiveFilter(null);
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
  setActiveFilter('name');
  successMessage.textContent = t('filter-name-msg');
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
    setActiveFilter(null);
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
  setActiveFilter('join');
  successMessage.textContent = t('filter-all-msg');
}

saveBtn.addEventListener('click', () => saveShoppingList());
// Delete requires a confirm click first, same two-step pattern as verify()/downloadList()
deleteBtn.addEventListener('click', confirmDelete);
export function confirmDelete() {
  clearMessages();

  let button = deleteBtn;
  button.id = 'confirmDeleteBtn';
  setButtonMode(button, 'confirm-delete', 'confirm-delete-aria');
  button.removeEventListener('click', verify);
  button.addEventListener('click', () => deleteList());

}

document.addEventListener('DOMContentLoaded', loadShoppingList);

// Item rows are generated in JS, so their text and aria-labels are rebuilt on a language switch
i18next.on('languageChanged', updateItemNumbers);