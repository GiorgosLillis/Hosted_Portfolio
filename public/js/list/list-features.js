// --- DRAG AND DROP LOGIC ---

// Variable to hold the currently dragged list item
let currentDraggedElement = null;
let currentTouchDropTarget = null;

/**
 * Attaches drag and drop event listeners (mouse and touch) to a given list item.
 * @param {HTMLElement} listItem The <li> element to make draggable.
 */

function cleanUpDragOverStyles() {
    const allItems = Array.from(List.children);
    allItems.forEach(item => {
        item.classList.remove('drag-over');
        item.style.borderTop = '';
        item.style.borderBottom = '';
    });
}

function addDragAndDropListeners(listItem) {
    // --- Mouse Drag Events ---
    listItem.addEventListener('dragstart', (e) => {
        currentDraggedElement = listItem;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', listItem.dataset.item);
        cleanUpDragOverStyles();
        setTimeout(() => {
            listItem.classList.add('dragging');
        }, 0);
    });

    listItem.addEventListener('dragenter', (e) => {
        e.preventDefault();
        // Only add class if it's a different list item and a valid drop target
        if (e.target.closest('li') && e.target.closest('li') !== currentDraggedElement) {
            e.target.closest('li').classList.add('drag-over');
        }
    });

    listItem.addEventListener('dragover', (e) => {
        e.preventDefault(); // Crucial: Allows a drop to happen
        e.dataTransfer.dropEffect = 'move';

        const targetLi = e.target.closest('li');
        // Apply dynamic border for insertion point
        if (targetLi && targetLi !== currentDraggedElement) {
            const boundingBox = targetLi.getBoundingClientRect();
            const offset = boundingBox.y + (boundingBox.height / 2); // Midpoint of the target li

            if (e.clientY < offset) {
                targetLi.style.borderTop = '3px solid var(--bs-effect) !important';
                targetLi.style.borderBottom = '';
            } else {
                targetLi.style.borderBottom = '3px solid var(--bs-effect) !important';
                targetLi.style.borderTop = '';
            }
        }
    });

    listItem.addEventListener('dragleave', (e) => {
        const targetLi = e.target.closest('li');
        if (targetLi) {
            targetLi.classList.remove('drag-over');
            targetLi.style.borderTop = '';
            targetLi.style.borderBottom = '';
        }
    });

    listItem.addEventListener('drop', (e) => {
        e.preventDefault();
        const dropTarget = e.target.closest('li');

        // Clean up drag-over styling from all items
        cleanUpDragOverStyles();

        if (dropTarget && currentDraggedElement && dropTarget !== currentDraggedElement) {
            const boundingBox = dropTarget.getBoundingClientRect();
            const offset = boundingBox.y + (boundingBox.height / 2);

            if (e.clientY < offset) {
                List.insertBefore(currentDraggedElement, dropTarget);
            } else {
                List.insertBefore(currentDraggedElement, dropTarget.nextSibling);
            }
            updateItemNumbers();
        }
    });

    listItem.addEventListener('dragend', () => {
        if (currentDraggedElement) {
            currentDraggedElement.classList.remove('dragging');
        }
        cleanUpDragOverStyles(); // Ensure all drag-over styles are removed
        currentDraggedElement = null; // Clear the dragged item reference
    });


    // --- Touch Drag Events ---
    listItem.addEventListener('touchstart', (e) => {
        // Only proceed if one finger is used for drag (multi-touch could be zoom/scroll)
        if (e.touches.length === 1) {
            // Start a timer to distinguish between tap and drag
            listItem._dragTouchTimer = setTimeout(() => {
                currentDraggedElement = listItem;
                listItem.classList.add('dragging');
            }, 1000); // 500ms threshold for drag vs tap
        }
    });

    listItem.addEventListener('touchend', (e) => {
        // Clear drag timer if touch ends quickly (it's a tap, not a drag)
        clearTimeout(listItem._dragTouchTimer);
        // ... rest of your touchend logic ...
        if (!currentDraggedElement) return;

        e.preventDefault(); // Prevent default action on touchend

        currentDraggedElement.classList.remove('dragging');
        cleanUpDragOverStyles(); // Remove any lingering drag-over styles

        // Determine the final drop target
        const lastTouch = e.changedTouches[0];
        const finalTargetElement = document.elementFromPoint(lastTouch.clientX, lastTouch.clientY);
        const finalDropTarget = finalTargetElement ? finalTargetElement.closest('li') : null;

        if (finalDropTarget && currentDraggedElement && finalDropTarget !== currentDraggedElement) {
            const boundingBox = finalDropTarget.getBoundingClientRect();
            const offset = boundingBox.y + (boundingBox.height / 2);

            if (lastTouch.clientY < offset) {
                // Drop above the target
                List.insertBefore(currentDraggedElement, finalDropTarget);
            } else {
                // Drop below the target
                List.insertBefore(currentDraggedElement, finalDropTarget.nextSibling);
            }
            updateItemNumbers(); // Re-number and save the new order
        }
        // Reset global variables
        currentDraggedElement = null;
        currentTouchDropTarget = null;
    });

    listItem.addEventListener('touchmove', (e) => {
        if (!currentDraggedElement) return;

        e.preventDefault(); // Prevent scrolling while dragging

        const touch = e.touches[0];
        const clientX = touch.clientX;
        const clientY = touch.clientY;
      
        // Find the element directly under the touch point
        const targetElement = document.elementFromPoint(clientX, clientY);
        const newTouchDropTarget = targetElement ? targetElement.closest('li') : null;

        // Clean up previous target styling
        if (currentTouchDropTarget && currentTouchDropTarget !== newTouchDropTarget) {
            currentTouchDropTarget.style.borderTop = '';
            currentTouchDropTarget.style.borderBottom = '';
        }

        if (newTouchDropTarget && newTouchDropTarget !== currentDraggedElement) {
            // Apply drag-over styling based on touch position
            const boundingBox = newTouchDropTarget.getBoundingClientRect();
            const offset = boundingBox.y + (boundingBox.height / 2);

            if (clientY < offset) {
                newTouchDropTarget.style.borderTop = '3px solid var(--bs-effect)';
                newTouchDropTarget.style.borderBottom = '';
            } else {
                newTouchDropTarget.style.borderBottom = '3px solid var(--bs-effect)';
                newTouchDropTarget.style.borderTop = '';
            }
            currentTouchDropTarget = newTouchDropTarget;
        } else {
            currentTouchDropTarget = null;
        }
    });

    listItem.addEventListener('touchend', (e) => {
        if (!currentDraggedElement) return;

        e.preventDefault(); // Prevent default action on touchend

        currentDraggedElement.classList.remove('dragging');
        cleanUpDragOverStyles(); // Remove any lingering drag-over styles

        // Determine the final drop target
        const lastTouch = e.changedTouches[0];
        const finalTargetElement = document.elementFromPoint(lastTouch.clientX, lastTouch.clientY);
        const finalDropTarget = finalTargetElement ? finalTargetElement.closest('li') : null;

        if (finalDropTarget && currentDraggedElement && finalDropTarget !== currentDraggedElement) {
            const boundingBox = finalDropTarget.getBoundingClientRect();
            const offset = boundingBox.y + (boundingBox.height / 2);

            if (lastTouch.clientY < offset) {
                // Drop above the target
                List.insertBefore(currentDraggedElement, finalDropTarget);
            } else {
                // Drop below the target
                List.insertBefore(currentDraggedElement, finalDropTarget.nextSibling);
            }
            updateItemNumbers(); // Re-number and save the new order
        }
        // Reset global variables
        currentDraggedElement = null;
        currentTouchDropTarget = null;
    });

    listItem.addEventListener('touchcancel', () => {
        // Clean up on touch cancel (e.g., if phone call comes in)
        if (currentDraggedElement) {
            currentDraggedElement.classList.remove('dragging');
        }
        cleanUpDragOverStyles();
        currentDraggedElement = null;
        currentTouchDropTarget = null;
    });
}

