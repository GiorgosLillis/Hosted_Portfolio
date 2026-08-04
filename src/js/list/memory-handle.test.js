// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../common/getcookie.js', () => ({
    checkAuth: vi.fn(),
}));

vi.mock('../common/recaptcha.js', () => ({
    loadRecaptchaScript: vi.fn(),
    getRecaptchaToken: vi.fn().mockResolvedValue('fake-recaptcha-token'),
}));

// basic-controls-list.js does real DOM lookups at module load - stub it out entirely
vi.mock('./basic-controls-list.js', () => ({
    List: document.createElement('ul'),
    list_items: [],
    updateItemNumbers: vi.fn(),
    errorMessage: { textContent: '' },
    successMessage: { textContent: '' },
    clearMessages: vi.fn(),
    confirmDelete: vi.fn(),
    resetList: vi.fn(),
    allButtons: [],
}));

// Node's own global `localStorage` shadows jsdom's implementation and doesn't fully
// implement it (no removeItem/clear) - replace with a minimal in-memory polyfill
function createMemoryStorage() {
    let store = {};
    return {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; },
    };
}

Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
});

const { checkAuth } = await import('../common/getcookie.js');
const { getRecaptchaToken } = await import('../common/recaptcha.js');
const basicControls = await import('./basic-controls-list.js');

document.body.innerHTML = `
    <div id="loadingMessage"></div>
    <div id="logStatus"></div>
    <button id="confirmDeleteBtn"></button>
`;

const { saveShoppingList, deleteList, loadShoppingList, trackRemovedItem } = await import('./memory-handle.js');

const fakeUser = { id: 1, firstName: 'John', lastName: 'Doe' };

// Simulates a rendered <li> the way basic-controls-list.js's real DOM would provide it
function makeListItem({ item = 'Milk', quantity = '2', unit = 'L', category = 'Dairy', checked = 'false', itemId } = {}) {
    return { dataset: { originalItem: item, id: '1', quantity, unit, category, checked, ...(itemId ? { itemId: String(itemId) } : {}) } };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    getRecaptchaToken.mockResolvedValue('fake-recaptcha-token');
    basicControls.list_items.length = 0;
    basicControls.errorMessage.textContent = '';
    basicControls.successMessage.textContent = '';
    document.body.innerHTML = `
        <div id="loadingMessage"></div>
        <div id="logStatus"></div>
        <button id="confirmDeleteBtn"></button>
    `;
});

describe('saveShoppingList', () => {
    it('refuses to save an empty list without checking auth', async () => {
        await saveShoppingList();

        expect(basicControls.errorMessage.textContent).toBe('Cannot save an empty list');
        expect(checkAuth).not.toHaveBeenCalled();
    });

    it('saves to the local-only store, in render shape, when not authenticated', async () => {
        checkAuth.mockResolvedValue(null);
        basicControls.list_items.push(makeListItem({ item: 'Milk', unit: 'L', category: 'Dairy', checked: 'true' }));

        await saveShoppingList();

        expect(global.fetch).not.toHaveBeenCalled();
        const stored = JSON.parse(localStorage.getItem('localShoppingList'));
        expect(stored).toEqual([{ name: 'Milk', quantity: '2', measure: 'L', category: 'Dairy', isPurchased: true, itemId: undefined }]);
        expect(localStorage.getItem('accountShoppingList')).toBeNull();
    });

    it('posts the list and any tracked removals, and syncs the account cache on success', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        global.fetch.mockResolvedValue({ ok: true });
        basicControls.list_items.push(makeListItem({ item: 'Milk' }));
        trackRemovedItem('Eggs');

        await saveShoppingList();

        expect(global.fetch).toHaveBeenCalledWith('/api/list', expect.objectContaining({ method: 'POST' }));
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.removed).toEqual(['Eggs']);
        expect(JSON.parse(localStorage.getItem('accountShoppingList'))[0].name).toBe('Milk');
    });

    it('clears tracked removals only after a successful save, not before', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        global.fetch.mockResolvedValue({ ok: true });
        basicControls.list_items.push(makeListItem({ item: 'Milk' }));
        trackRemovedItem('Eggs');

        await saveShoppingList();
        await saveShoppingList();

        const secondBody = JSON.parse(global.fetch.mock.calls[1][1].body);
        expect(secondBody.removed).toEqual([]);
    });

    it('keeps tracked removals for a retry when the save fails', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        global.fetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'Server error' }) });
        basicControls.list_items.push(makeListItem({ item: 'Milk' }));
        trackRemovedItem('Eggs');

        await saveShoppingList();

        expect(basicControls.errorMessage.textContent).toBe('Server error');
        expect(localStorage.getItem('accountShoppingList')).toBeNull();

        // Retry, this time succeeding - the earlier removal must still be sent
        global.fetch.mockResolvedValue({ ok: true });
        await saveShoppingList();

        const secondBody = JSON.parse(global.fetch.mock.calls[1][1].body);
        expect(secondBody.removed).toEqual(['Eggs']);
    });
});

describe('deleteList', () => {
    it('clears the account cache and tracked removals on success', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        global.fetch.mockResolvedValue({ ok: true });
        localStorage.setItem('accountShoppingList', JSON.stringify([{ name: 'Milk' }]));
        trackRemovedItem('Eggs');

        await deleteList();

        expect(global.fetch).toHaveBeenCalledWith('/api/list', expect.objectContaining({ method: 'DELETE' }));
        expect(localStorage.getItem('accountShoppingList')).toBeNull();
        expect(basicControls.resetList).toHaveBeenCalled();

        // Removals tracked before the delete must not leak into a later save
        checkAuth.mockResolvedValue(fakeUser);
        global.fetch.mockResolvedValue({ ok: true });
        basicControls.list_items.push(makeListItem({ item: 'Milk' }));
        await saveShoppingList();
        const body = JSON.parse(global.fetch.mock.calls[1][1].body);
        expect(body.removed).toEqual([]);
    });

    it('refuses to delete without ever calling the server when not authenticated', async () => {
        checkAuth.mockResolvedValue(null);

        await deleteList();

        expect(global.fetch).not.toHaveBeenCalled();
        expect(basicControls.errorMessage.textContent).toBe('Log in or register to save and manage a shopping list on your account.');
    });
});

describe('loadShoppingList', () => {
    it('caches the server list under the account key and renders it when authenticated', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        const serverList = [{ name: 'Milk', quantity: 2, measure: 'L', category: 'Dairy', isPurchased: false }];
        global.fetch.mockResolvedValue({ ok: true, json: async () => ({ list: serverList }) });

        loadShoppingList();
        await flush();

        expect(JSON.parse(localStorage.getItem('accountShoppingList'))).toEqual(serverList);
        expect(basicControls.updateItemNumbers).toHaveBeenCalled();
    });

    it('clears the account cache when the server reports an empty list', async () => {
        checkAuth.mockResolvedValue(fakeUser);
        localStorage.setItem('accountShoppingList', JSON.stringify([{ name: 'Stale' }]));
        global.fetch.mockResolvedValue({ ok: true, json: async () => ({ list: [] }) });

        loadShoppingList();
        await flush();

        expect(localStorage.getItem('accountShoppingList')).toBeNull();
    });

    it('reads from the local-only store, never the account one, when not authenticated', async () => {
        checkAuth.mockResolvedValue(null);
        localStorage.setItem('localShoppingList', JSON.stringify([{ name: 'Bread', quantity: 1, measure: 'pcs' }]));
        localStorage.setItem('accountShoppingList', JSON.stringify([{ name: 'Stale account item' }]));

        loadShoppingList();
        await flush();

        expect(global.fetch).not.toHaveBeenCalled();
        expect(basicControls.errorMessage.textContent).toBe('Showing your list saved on this device. Log in or register to save it to your account and access it everywhere.');
    });
});
