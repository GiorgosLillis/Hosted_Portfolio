// Reading and writing the shopping list as CSV. No DOM here, so it can be tested on its own.
import { hasOnlyAllowedItemCharacters } from '../common/validation.js';

export const CSV_COLUMNS = ['category', 'item', 'quantity', 'unit', 'purchased'];
export const MAX_CSV_BYTES = 100 * 1024;

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Seafood', 'Bakery', 'Pantry', 'Frozen', 'Beverages', 'Snacks', 'Household', 'Personal Care', 'Other'];
const UNITS = ['pcs', 'kg', 'g', 'L', 'ml', 'packs', 'boxes', 'bottles', 'cans', 'rolls', 'bags', 'units', 'each'];
const MAX_QUANTITY = 1000;
const MAX_NAME_LENGTH = 100;
const MAX_UNIT_LENGTH = 30;

// A spreadsheet runs a cell that starts with one of these as a formula ("CSV injection"), even inside quotes
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeCell(value) {
    let text = String(value ?? '');
    // The apostrophe makes Excel and LibreOffice show the cell as plain text; parsing strips it again
    if (FORMULA_START.test(text)) {
        text = `'${text}`;
    }
    return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// items: { category, item, quantity, unit, purchased }. The BOM and "sep=," let Excel open it as UTF-8 with commas, Greek included.
export function toListCsv(items) {
    const rows = items.map((entry) => [entry.category, entry.item, entry.quantity, entry.unit, entry.purchased ? 'yes' : 'no']);
    return '﻿' + ['sep=,', CSV_COLUMNS.join(','), ...rows.map((row) => row.map(escapeCell).join(','))].join('\r\n') + '\r\n';
}

// RFC 4180: quoted fields may contain the delimiter, quotes ("") and line breaks. Each record keeps the line it started on.
function parseRecords(text, delimiter, firstLine) {
    const records = [];
    let cells = [];
    let field = '';
    let inQuotes = false;
    let line = firstLine;
    let recordLine = firstLine;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                if (char === '\n') line++;
                field += char;
            }
        } else if (char === '"' && field === '') {
            inQuotes = true;
        } else if (char === delimiter) {
            cells.push(field);
            field = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i++;
            cells.push(field);
            records.push({ cells, line: recordLine });
            cells = [];
            field = '';
            line++;
            recordLine = line;
        } else {
            field += char;
        }
    }
    if (field !== '' || cells.length > 0) {
        cells.push(field);
        records.push({ cells, line: recordLine });
    }
    return { records, unclosedQuote: inQuotes };
}

function hasRepeats(text) {
    return /(.)\1{3,}/u.test(text);
}

// One data row as a list item, or null when any value breaks a rule. The same rules as adding an item by hand.
// A name that looks like a formula is harmless on the page (shown as text) and is escaped again on the next download.
function parseItem(values) {
    const category = CATEGORIES.find((name) => name.toLowerCase() === values.category.toLowerCase());
    // Takes off the apostrophe that toListCsv puts in front of formula-like names
    const item = values.item.startsWith("'") && FORMULA_START.test(values.item.slice(1)) ? values.item.slice(1) : values.item;
    const quantityText = values.quantity.replace(',', '.');
    const quantity = Number(quantityText);
    const unit = UNITS.find((name) => name.toLowerCase() === values.unit.toLowerCase()) ?? values.unit;
    const purchased = { yes: true, true: true, 1: true, no: false, false: false, 0: false, '': false }[values.purchased.toLowerCase()];

    const valid = category
        && item.length >= 2 && item.length <= MAX_NAME_LENGTH && /\p{L}/u.test(item) && !hasRepeats(item) && hasOnlyAllowedItemCharacters(item)
        && /^\d+(\.\d+)?$/.test(quantityText) && quantity > 0 && quantity <= MAX_QUANTITY
        && /^\p{L}+$/u.test(unit) && unit.length <= MAX_UNIT_LENGTH && !hasRepeats(unit)
        && purchased !== undefined;

    return valid ? { category, item, quantity: quantityText, unit, purchased } : null;
}

// Returns { items, invalid } where invalid lists { line, text } for every bad row (line numbers as seen in an editor),
// or { error } when the file as a whole can't be read: 'format' (an unclosed quote), 'header' (missing or wrong column names), 'empty'.
export function parseListCsv(fileText) {
    let text = fileText.replace(/^﻿/, '');
    let firstLine = 1;

    // "sep=;" on the first line names the delimiter (Excel writes and reads it). Otherwise the header decides:
    // Excel with Greek or other European settings saves with ";" instead of ",".
    let delimiter = ',';
    const sepLine = text.match(/^sep=(.)\r?\n/i);
    if (sepLine) {
        delimiter = sepLine[1];
        text = text.slice(sepLine[0].length);
        firstLine = 2;
    } else {
        const header = text.split(/\r?\n/, 1)[0];
        delimiter = (header.match(/;/g) || []).length > (header.match(/,/g) || []).length ? ';' : ',';
    }

    const { records, unclosedQuote } = parseRecords(text, delimiter, firstLine);
    if (unclosedQuote) {
        return { error: 'format' };
    }
    const rows = records.filter((record) => record.cells.some((cell) => cell.trim() !== ''));
    if (rows.length === 0) {
        return { error: 'empty' };
    }

    // The columns may come in any order, but all five must be there, once each
    const header = rows[0].cells.map((cell) => cell.trim().toLowerCase());
    const positions = CSV_COLUMNS.map((column) => header.indexOf(column));
    if (header.length !== CSV_COLUMNS.length || positions.includes(-1)) {
        return { error: 'header' };
    }

    const items = [];
    const invalid = [];
    const seenNames = new Set();
    for (const { cells, line } of rows.slice(1)) {
        const values = Object.fromEntries(CSV_COLUMNS.map((column, index) => [column, (cells[positions[index]] ?? '').trim()]));
        const entry = cells.length === CSV_COLUMNS.length ? parseItem(values) : null;
        // The same item twice is a mistake in the file, the server would merge the two into one
        const name = entry?.item.toUpperCase();
        if (!entry || seenNames.has(name)) {
            invalid.push({ line, text: cells.join(delimiter) });
            continue;
        }
        seenNames.add(name);
        items.push(entry);
    }
    if (items.length === 0 && invalid.length === 0) {
        return { error: 'empty' };
    }
    return { items, invalid };
}
