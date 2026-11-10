import i18next from './i18n.js';

// Builds and shows a Bootstrap toast, self-removes from the DOM once it's dismissed
function showToast(message, type = 'success', duration = 5000) {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        console.error('Toast container not found!');
        return;
    }

    const displayMessage = message || (i18next.exists(`toast-default-${type}`) ? i18next.t(`toast-default-${type}`) : 'Message');

    const toastEl = document.createElement('div');
    toastEl.className = `toast text-white bg-${type} border-0 fs-5`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');

    const toastHeader = document.createElement('div');
    toastHeader.className = 'toast-header bg-transparent border-0 text-white';

    const status = document.createElement('strong');
    status.className = 'me-auto';
    status.textContent = (i18next.exists(`toast-label-${type}`) ? i18next.t(`toast-label-${type}`) : type).toLocaleUpperCase(i18next.language);
    
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn-close btn-close-white';
    closeButton.setAttribute('data-bs-dismiss', 'toast');
    closeButton.setAttribute('aria-label', i18next.t('close'));

    toastHeader.appendChild(status);
    toastHeader.appendChild(closeButton);

    const toastBody = document.createElement('div');
    toastBody.className = 'toast-body';
    toastBody.textContent = displayMessage;

    toastEl.appendChild(toastHeader);
    toastEl.appendChild(toastBody);

    toastContainer.appendChild(toastEl);

    const toast = new bootstrap.Toast(toastEl, {
        delay: duration
    });

    toast.show();

    toastEl.addEventListener('hidden.bs.toast', function () {
        toastEl.remove();
    });
}

export { showToast };