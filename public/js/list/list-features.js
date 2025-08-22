import { updateItemNumbers, List, list_items } from "/js/basic-controls-list.js";


// --- DRAG AND DROP LOGIC ---

// Variable to hold the currently dragged list item
let currentDraggedElement = null;
let currentTouchDropTarget = null;
let longPressTimer = null;

/**
 * Attaches drag and drop event listeners (mouse and touch) to a given list item.
 * @param {HTMLElement} listItem The <li> element to make draggable.
 */

function cleanUpDragOverStyles() {
    const allItems = Array.from(list_items);
    allItems.forEach(item => {
        item.classList.remove('dragging');
        item.style.boxShadow = '';
    });
}

export function addDragAndDropListeners(listItem) {
    // --- Mouse Drag Events ---
    listItem.addEventListener('dragstart', (e) => {
        currentDraggedElement = listItem;
        if (e.dataTransfer && typeof e.dataTransfer.effectAllowed !== 'undefined') {
            e.dataTransfer.setData('text/plain', listItem.dataset.item || '');
        }
        cleanUpDragOverStyles();
        setTimeout(() => {
            listItem.classList.add('dragging');
        }, 0);
    });

    listItem.addEventListener('dragover', (e) => {
        e.preventDefault(); // Crucial: Allows a drop to happen
        if (e.dataTransfer && typeof e.dataTransfer.effectAllowed !== 'undefined') {
            e.dataTransfer.setData('text/plain', listItem.dataset.item || '');
        }

        cleanUpDragOverStyles();

        const targetLi = e.target.closest('li');
        // Apply dynamic border for insertion point
        if (targetLi && targetLi !== currentDraggedElement) {
            const boundingBox = targetLi.getBoundingClientRect();
            const offset = boundingBox.y + (boundingBox.height / 2); // Midpoint of the target li

            if (e.clientY < offset) {
                targetLi.style.boxShadow = 'inset 0 3px 0 0 var(--bs-effect)';
                targetLi.style.borderBottom = '';
            } else {
                targetLi.style.boxShadow = 'inset 0 -3px 0 0 var(--bs-effect)';
                targetLi.style.borderTop = '';
            }
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
            currentDraggedElement = null;
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
            if (longPressTimer) {
                clearTimeout(longPressTimer);
            }

            longPressTimer = setTimeout(() => {
                currentDraggedElement = listItem;
                listItem.classList.add('dragging');
                e.preventDefault();
            }, 400); // 400ms threshold for drag vs tap
        }
    });


    listItem.addEventListener('touchmove', (e) => {

        if (!currentDraggedElement) return;
        e.preventDefault(); // Prevent scrolling while dragging

        const touch = e.touches[0];
        const clientX = touch.clientX;
        const clientY = touch.clientY;

        // Find the element directly under the touch point
        const targetElement = document.elementFromPoint(clientX, clientY);
        const newTouchDropTarget = targetElement.closest('li');


        cleanUpDragOverStyles();

        if (newTouchDropTarget && newTouchDropTarget !== currentDraggedElement) {
            // Apply drag-over styling based on touch position
            const boundingBox = newTouchDropTarget.getBoundingClientRect();
            const offset = boundingBox.y + (boundingBox.height / 2);

            if (clientY < offset) {
                newTouchDropTarget.style.boxShadow = 'inset 0 3px 0 0 var(--bs-effect)';
                newTouchDropTarget.style.borderBottom = '';
            } else {
                newTouchDropTarget.style.boxShadow = 'inset 0 -3px 0 0 var(--bs-effect)';
                newTouchDropTarget.style.borderTop = '';
            }
            currentTouchDropTarget = newTouchDropTarget;
        }
        clearTimeout(longPressTimer);
        longPressTimer = null;
    });

    listItem.addEventListener('touchend', (e) => {


        // Clear drag timer if touch ends quickly (it's a tap, not a drag)
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            return;
        }

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
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (currentDraggedElement) {
            currentDraggedElement.classList.remove('dragging');
        }
        cleanUpDragOverStyles();
        currentDraggedElement = null;
        currentTouchDropTarget = null;
    });
}

