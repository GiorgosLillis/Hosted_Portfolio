import { describe, it, expect } from 'vitest';
import { toListCsv, parseListCsv, CSV_COLUMNS } from './list-csv.js';

const milk = { category: 'Dairy', item: 'Milk', quantity: '2', unit: 'L', purchased: false };
const bread = { category: 'Bakery', item: 'Bread', quantity: '1', unit: 'pcs', purchased: true };

describe('toListCsv', () => {
    it('writes a BOM, an Excel "sep" hint, the header and one row per item', () => {
        const csv = toListCsv([milk, bread]);
        expect(csv.startsWith('﻿')).toBe(true);
        expect(csv.slice(1).split('\r\n')).toEqual([
            'sep=,',
            CSV_COLUMNS.join(','),
            'Dairy,Milk,2,L,no',
            'Bakery,Bread,1,pcs,yes',
            '',
        ]);
    });

    it('quotes values with a comma, semicolon, quote or line break', () => {
        const csv = toListCsv([{ ...milk, item: 'Milk, "fresh"; 2%' }]);
        expect(csv).toContain('"Milk, ""fresh""; 2%"');
    });

    it('puts an apostrophe in front of a name a spreadsheet would run as a formula', () => {
        for (const start of ['=', '+', '-', '@']) {
            const csv = toListCsv([{ ...milk, item: `${start}HYPERLINK("x")` }]);
            expect(csv).toContain(`"'${start}HYPERLINK(""x"")"`);
        }
    });
});

describe('parseListCsv', () => {
    it('reads back exactly what toListCsv wrote', () => {
        expect(parseListCsv(toListCsv([milk, bread]))).toEqual({ items: [milk, bread], invalid: [] });
    });

    it('takes the escaping apostrophe off a formula-like name again', () => {
        const formulaLike = { ...milk, item: '-Milk drink' };
        expect(parseListCsv(toListCsv([formulaLike])).items[0].item).toBe('-Milk drink');
    });

    it('reads a file saved by Excel with Greek settings: ";" between columns and a decimal comma', () => {
        const csv = 'category;item;quantity;unit;purchased\r\nProduce;Μήλα;1,5;kg;yes\r\n';
        expect(parseListCsv(csv).items).toEqual([{ category: 'Produce', item: 'Μήλα', quantity: '1.5', unit: 'kg', purchased: true }]);
    });

    it('uses the delimiter named on a "sep=" line', () => {
        const csv = 'sep=;\ncategory;item;quantity;unit;purchased\nDairy;Milk;2;L;no\n';
        expect(parseListCsv(csv).items).toEqual([milk]);
    });

    it('accepts the columns in any order, any letter case for category and unit, and several ways to say purchased', () => {
        const csv = 'Purchased,Unit,Item,Quantity,Category\ntrue,PCS,Bread,1,bakery\n0,l,Milk,2,DAIRY\n,kg,Rice,3,pantry\n';
        expect(parseListCsv(csv).items).toEqual([
            { category: 'Bakery', item: 'Bread', quantity: '1', unit: 'pcs', purchased: true },
            { category: 'Dairy', item: 'Milk', quantity: '2', unit: 'L', purchased: false },
            { category: 'Pantry', item: 'Rice', quantity: '3', unit: 'kg', purchased: false },
        ]);
    });

    it('keeps a comma inside a quoted name', () => {
        const csv = 'category,item,quantity,unit,purchased\nOther,"Paper, recycled",2,packs,no\n';
        expect(parseListCsv(csv).items[0].item).toBe('Paper, recycled');
    });

    it('reads quotes and line breaks inside a quoted field correctly, then refuses them as name characters', () => {
        const csv = 'category,item,quantity,unit,purchased\nOther,"Paper ""recycled""\nA4",2,packs,no\nDairy,Milk,2,L,no\n';
        const result = parseListCsv(csv);
        // The quoted field was read as one cell, so the next row is still read as Milk on its own line
        expect(result.items).toEqual([milk]);
        expect(result.invalid).toEqual([{ line: 2, text: 'Other,Paper "recycled"\nA4,2,packs,no' }]);
    });

    it('skips blank lines', () => {
        const csv = 'category,item,quantity,unit,purchased\n\nDairy,Milk,2,L,no\n,,,,\n';
        expect(parseListCsv(csv).items).toEqual([milk]);
    });

    it('reports every bad row with the line number an editor would show', () => {
        const csv = [
            'category,item,quantity,unit,purchased', // line 1
            'Dairy,Milk,2,L,no',                     // 2 ok
            'Toys,Ball,1,pcs,no',                    // 3 unknown category
            'Dairy,M,1,L,no',                        // 4 name too short
            'Dairy,12345,1,L,no',                    // 5 name without letters
            'Dairy,Cheese,0,kg,no',                  // 6 quantity 0
            'Dairy,Butter,1001,g,no',                // 7 quantity over 1000
            'Dairy,Yogurt,2,k9,no',                  // 8 unit with a digit
            'Dairy,Cream,1,L,maybe',                 // 9 purchased not yes/no
            'Dairy,Eggs,6,pcs',                      // 10 a column missing
            'Dairy,milk,1,L,no',                     // 11 the same item twice (any letter case)
            'Dairy,Wheyyyyy,1,L,no',                 // 12 keyboard-mash repeat
        ].join('\n');
        const result = parseListCsv(csv);
        expect(result.items).toEqual([milk]);
        expect(result.invalid.map((row) => row.line)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    it('counts lines inside a quoted, multi-line field when numbering later rows', () => {
        const csv = 'category,item,quantity,unit,purchased\nOther,"Two\nlines",1,pcs,no\nToys,Ball,1,pcs,no\n';
        // Line 2 is refused for the line break in the name, the next row starts on line 4 of the file
        expect(parseListCsv(csv).invalid.map((row) => row.line)).toEqual([2, 4]);
    });

    it('refuses the whole file when the header is missing or wrong, a quote never closes, or nothing is in it', () => {
        expect(parseListCsv('Dairy,Milk,2,L,no\n')).toEqual({ error: 'header' });
        expect(parseListCsv('category,item,quantity,unit\nDairy,Milk,2,L\n')).toEqual({ error: 'header' });
        expect(parseListCsv('category,item,quantity,unit,purchased,extra\n')).toEqual({ error: 'header' });
        expect(parseListCsv('category,item,quantity,unit,purchased\nDairy,"Milk,2,L,no\n')).toEqual({ error: 'format' });
        expect(parseListCsv('')).toEqual({ error: 'empty' });
        expect(parseListCsv('﻿\n\n')).toEqual({ error: 'empty' });
        expect(parseListCsv('category,item,quantity,unit,purchased\n')).toEqual({ error: 'empty' });
    });

    it('accepts the punctuation real products use, in any language', () => {
        const names = ["M&M's", 'Coca-Cola', 'Milk 2%', 'Water (1.5L)', 'Salt / pepper', 'Gum + mints', 'Yes! Or no?', 'Φέτα Π.Ο.Π.', 'Café crème', 'Tea’s'];
        const csv = 'category,item,quantity,unit,purchased\n' + names.map((name, i) => `Other,"${name}",${i + 1},pcs,no`).join('\n');
        const result = parseListCsv(csv);
        expect(result.invalid).toEqual([]);
        expect(result.items.map((entry) => entry.item)).toEqual(names);
    });

    it('refuses names with markup, other special characters or emoji', () => {
        const names = ['<img src=x onerror=alert(1)>', 'Milk "fresh"', 'a@b.com', 'Rice; drop', 'Eggs {6}', 'Back\\slash', 'Price $5', 'Pizza 🍕', 'Bread*'];
        const csv = 'category,item,quantity,unit,purchased\n' + names.map((name, i) => `Other,"${name.replace(/"/g, '""')}",${i + 1},pcs,no`).join('\n');
        const result = parseListCsv(csv);
        expect(result.items).toEqual([]);
        expect(result.invalid).toHaveLength(names.length);
    });

    it('keeps the escaping round trip for names that start like a formula but use only allowed characters', () => {
        expect(parseListCsv(toListCsv([{ ...milk, item: '+Extra milk' }])).items[0].item).toBe('+Extra milk');
    });
});
