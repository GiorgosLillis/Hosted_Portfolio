document.getElementById('submitBtn').addEventListener('click', saveList);
function saveList(e) {
  e.preventDefault();

  let list_el = document.getElementById('displayList');
  let list_items = Array.from(list_el.children); // Get all existing list items so we can manipulate them
  let errorMessage = document.getElementById('errorMessage');
  errorMessage.textContent = ''; // Clear any previous error messages
  let item = document.getElementById('item');

  if (!item.value.trim()) {
    document.getElementById('errorMessage').textContent = 'Please enter a valid item';
    return;
  }
  const newItemText = item.value.trim().toUpperCase();
  const existingTexts = list_items.map(item => {
    const text = item.textContent.trim().replace(/^\d+\.\s*/, '').replace(/\s*Remove$/, '');
    item.textContent = text; // Remove number temporarily
    return text.toUpperCase();
  });

  if (existingTexts.includes(newItemText)) {
    errorMessage.textContent = 'Item already exists in the list';
    // Restore numbers if duplicate found
    updateItemNumbers();
    item.value = ''; 
    item.focus(); 
    return;
  }

  let listItem = document.createElement('li');
  listItem.className = 'list-group-item fs-5 '; // Add Bootstrap classes for styling
  listItem.textContent = item.value.toUpperCase();
  // Add new item to the TOP of the list 
  list_el.prepend(listItem);
  updateItemNumbers();
  item.value = ''; // Clear the input field after adding the item
  item.focus(); // Set focus back to the input field
}

function updateItemNumbers() {
  let list_el = document.getElementById('displayList');
  let list_items = Array.from(list_el.children);
  
  for (let i = 0; i < list_items.length; i++) {
    const currentNumber = list_items.length - i; // Prints the current number in reverse order
    const itemText = list_items[i].childNodes[0].textContent.trim().replace(/^\d+\.\s*/, '').replace(/\s*Remove$/, '');
    // Update the innerHTML to include the current number and item text
    list_items[i].className = 'list-group-item fs-5 mb-3 rounded-3'; // Ensure the class is set for styling
    list_items[i].innerHTML = `
      ${currentNumber}. ${itemText}
    `;
    const removeBtn = createBtn(); 
    list_items[i].appendChild(removeBtn); 
  }
}

function createBtn() {
  let btn = document.createElement('button');
  btn.textContent = 'Remove';
  btn.className = 'btn btn-danger btn-sm float-end';
  btn.onclick = function() {
      this.parentElement.remove();
      updateItemNumbers();
    };
  return btn;
}

document.getElementById('resetBtn').addEventListener('click', resetList);
function resetList() {
  let list_el = document.getElementById('displayList');
  let list_items = Array.from(list_el.children); // Get all existing list items to remove them
  list_items.forEach(function(item) {
    item.remove();
  });
  list_el.innerHTML = '';
  document.getElementById('errorMessage').textContent = '';
  document.getElementById('item').value = '';
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
  button.id = 'confirmDownloadBtn'; // Change the button ID to confirmDownloadBtn
  button.textContent = 'Confirm Download';
  button.removeEventListener('click', verify); 
  button.addEventListener('click', downloadList); // Add the downloadList function as the new click handler
}

function downloadList() {
  let list_el = document.getElementById('displayList');
  let list_items = Array.from(list_el.children);

 
  let textContent = list_items
    .map((li) => `${li.textContent.replace(/Remove$/, '').trim()}`) // Map each list item to its text content, removing the "Remove" button text
    .filter(item => item.replace(/^\d+\.\s*/, '').trim() !== '') // Filter out empty items
    .join('\n');

  let blob = new Blob([textContent], { type: 'text/plain' }); // Create a Blob from the text content Array
  let url = URL.createObjectURL(blob);

  let a = document.createElement('a'); // Create a temporary anchor element to trigger the download
  a.href = url;
  a.download = 'list.txt';
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a); // Remove the temporary anchor element
  URL.revokeObjectURL(url); // Clean up the URL object
  document.getElementById('confirmDownloadBtn').textContent = 'Download List'; 
}


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
      await processUploadedFile(files[0]); // Process the first file
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

async function processUploadedFile(file) {
  const errorMessage = document.getElementById('errorMessage');
  errorMessage.textContent = ''; 
  if (!file || file.type !== 'text/plain') {
    errorMessage.textContent = 'Please upload a valid text file';
    return;
  }
  const list_el = document.getElementById('displayList');
  
  // Update info display
  const fileInfo = document.getElementById('fileInfo');
  fileInfo.textContent = '';
  fileInfo.className = 'alert alert-info fs-5'; 
  fileInfo.innerHTML = `<strong>Selected file:</strong> ${file.name}`;
  fileInfo.innerHTML += `<br><strong>File size:</strong> ${formatFileSize(file.size)}`;
 
  // Read file content
  try {
    const fileContent = await readFileAsText(file); 
    const items = fileContent.split('\n').filter(item => item.trim());
    
    if (items.length === 0) {
      errorMessage.textContent = 'File is empty or contains no valid items';
      return;
    }
    
    // Clear existing list
    resetList();
    
    // Add items from file
    items.forEach(item => {
      const listItem = document.createElement('li');
      listItem.className = 'list-group-item fs-5 mb-3 rounded-3';
      listItem.textContent = item.trim();
      const removeBtn = createBtn();
      listItem.appendChild(removeBtn);
      list_el.prepend(listItem);
      updateItemNumbers();
    });
    
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