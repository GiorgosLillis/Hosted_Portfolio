import { updateItemNumbers, List, list_items } from "./basic-controls-list.js";

function throttle(func, limit) {
    let inThrottle;
    return function () {
        const context = this;
        const args = arguments;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// --- DRAG AND DROP LOGIC ---

// Variable to hold the currently dragged list item
let currentDraggedElement = null;
let currentTouchDropTarget = null;
let longPressTimer = null;
let touchStartX = 0;
let touchStartY = 0;
const dragThreshold = 10;

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

function handleReorderLogic(clientX, clientY, targetElement) {
    const dropTarget = targetElement ? targetElement.closest('li') : null;

    if (dropTarget && currentDraggedElement && dropTarget !== currentDraggedElement) {
        const boundingBox = dropTarget.getBoundingClientRect();
        const offset = boundingBox.y + (boundingBox.height / 2);

        cleanUpDragOverStyles();

        if (clientY < offset) {
            dropTarget.style.boxShadow = `0 -4px 0 var(--bs-effect)`;
        } else {
            dropTarget.style.boxShadow = `0 4px 0 var(--bs-effect)`;
        }
        currentTouchDropTarget = dropTarget;
    } else {
        cleanUpDragOverStyles();
        currentTouchDropTarget = null;
    }
}

// Throttled version of the drag/reorder logic (limits heavy calculations)
const throttledReorderLogic = throttle((e) => {
    if (!currentDraggedElement || e.touches.length === 0) return;

    const touch = e.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    handleReorderLogic(touch.clientX, touch.clientY, targetElement);
}, 50);


export function addDragAndDropListeners(listItem) {
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
        e.preventDefault();
        if (currentDraggedElement) {
            const targetElement = document.elementFromPoint(e.clientX, e.clientY);
            handleReorderLogic(e.clientX, e.clientY, targetElement);
        }
        if (e.dataTransfer && typeof e.dataTransfer.effectAllowed !== 'undefined') {
            e.dataTransfer.effectAllowed = 'move';
        }
    });

    listItem.addEventListener('drop', (e) => {
        e.preventDefault();
        cleanUpDragOverStyles();

        if (currentDraggedElement && currentTouchDropTarget) {
            const boundingBox = currentTouchDropTarget.getBoundingClientRect();
            const clientY = e.clientY;
            const offset = boundingBox.y + (boundingBox.height / 2);

            if (clientY < offset) {
                List.insertBefore(currentDraggedElement, currentTouchDropTarget);
            } else {
                List.insertBefore(currentDraggedElement, currentTouchDropTarget.nextSibling);
            }
            updateItemNumbers();
        }
        currentDraggedElement = null;
        currentTouchDropTarget = null;
    });

    listItem.addEventListener('dragend', () => {
        if (currentDraggedElement) {
            currentDraggedElement.classList.remove('dragging');
        }
        cleanUpDragOverStyles();
        currentDraggedElement = null;
        currentTouchDropTarget = null;
    });

    listItem.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;


            if (longPressTimer) {
                clearTimeout(longPressTimer);
            }

            longPressTimer = setTimeout(() => {
                currentDraggedElement = listItem;
                listItem.classList.add('dragging');
            }, 400);
        }
    });


    listItem.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        if (longPressTimer) {
            const deltaX = Math.abs(touch.clientX - touchStartX);
            const deltaY = Math.abs(touch.clientY - touchStartY);
            if (deltaX > dragThreshold || deltaY > dragThreshold) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                return;
            }
        }

        if (currentDraggedElement) {
            e.preventDefault();
            currentDraggedElement.classList.add('dragging');
            throttledReorderLogic(e);
        }


    });

    listItem.addEventListener('touchend', (e) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (currentDraggedElement && currentTouchDropTarget) {
            const boundingBox = currentTouchDropTarget.getBoundingClientRect();
            const lastTouch = e.changedTouches[0];
            const offset = boundingBox.y + (boundingBox.height / 2);

            if (lastTouch.clientY < offset) {
                List.insertBefore(currentDraggedElement, currentTouchDropTarget);
            } else {
                List.insertBefore(currentDraggedElement, currentTouchDropTarget.nextSibling);
            }
            updateItemNumbers();
        }

        if (currentDraggedElement) {
            currentDraggedElement.classList.remove('dragging');
        }
        cleanUpDragOverStyles();
        currentDraggedElement = null;
        currentTouchDropTarget = null;
    });

    listItem.addEventListener('touchcancel', () => {
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

