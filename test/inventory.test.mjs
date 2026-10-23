import { describe, it, expect } from 'vitest';
import {
  loadInventory, saveInventory, addItem, updateItem, removeItem,
  expiryStatus, daysLeft, sortForDisplay, searchInventory,
  memoryStore, INVENTORY_KEY, MAX_ITEMS, EXPIRING_DAYS,
} from '../src/ui/inventory.mjs';

const NOW = new Date('2026-10-24T00:00:00.000Z');
const inDays = (n) => new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);

describe('round-trip', () => {
  it('should persist and reload items', () => {
    const s = memoryStore();
    const items = addItem([], { name: 'Tris base', lot: 'SLBK1234V' }, NOW);
    expect(saveInventory(s, items)).toBe(true);
    expect(loadInventory(s)).toEqual(items);
  });

  it('should return an empty list for a fresh or corrupt store', () => {
    expect(loadInventory(memoryStore())).toEqual([]);
    const bad = memoryStore({ [INVENTORY_KEY]: '{oops' });
    expect(loadInventory(bad)).toEqual([]);
    const notArray = memoryStore({ [INVENTORY_KEY]: '{"a":1}' });
    expect(loadInventory(notArray)).toEqual([]);
  });

  it('should report a failed write rather than throwing', () => {
    const hostile = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    expect(saveInventory(hostile, [])).toBe(false);
    expect(loadInventory(hostile)).toEqual([]);
  });

  it('should drop rows without a name and cap the stored list', () => {
    const s = memoryStore();
    const rows = Array.from({ length: MAX_ITEMS + 10 }, (_, i) => ({ name: `r${i}` }));
    saveInventory(s, rows);
    expect(loadInventory(s)).toHaveLength(MAX_ITEMS);
    s.setItem(INVENTORY_KEY, JSON.stringify([{ name: '' }, { lot: 'x' }, { name: 'ok' }]));
    expect(loadInventory(s)).toHaveLength(1);
  });
});

describe('addItem / updateItem / removeItem', () => {
  it('should refuse a nameless add and trim the name', () => {
    expect(addItem([], {})).toEqual([]);
    expect(addItem([], { name: '  NaCl  ' })[0].name).toBe('NaCl');
  });

  it('should put the newest first', () => {
    const a = addItem([], { name: 'a' }, new Date('2026-01-01T00:00:00Z'));
    const b = addItem(a, { name: 'b' }, new Date('2026-01-02T00:00:00Z'));
    expect(b.map((x) => x.name)).toEqual(['b', 'a']);
  });

  it('should patch only the named fields and refuse an empty name', () => {
    const [item] = addItem([], { name: 'a', lot: 'L1' });
    const out = updateItem([item], item.id, { lot: 'L2', expiry: '2027-01-01' });
    expect(out[0].lot).toBe('L2');
    expect(out[0].expiry).toBe('2027-01-01');
    expect(out[0].name).toBe('a');
    expect(updateItem(out, item.id, { name: '   ' })[0].name).toBe('a');
  });

  it('should remove only the named item', () => {
    const items = [...addItem([], { name: 'a' }), ...addItem([], { name: 'b' })];
    const out = removeItem(items, items[1].id);
    expect(out.map((x) => x.name)).toEqual(['a']);
  });
});

describe('expiry', () => {
  it('should treat the boundary day itself as expiring, not expired', () => {
    expect(expiryStatus({ expiry: inDays(EXPIRING_DAYS) }, NOW)).toBe('expiring');
  });

  it('should classify none, ok, expiring, expired', () => {
    expect(expiryStatus({ expiry: '' }, NOW)).toBe('none');
    expect(expiryStatus({ expiry: 'not-a-date' }, NOW)).toBe('none');
    expect(expiryStatus({ expiry: inDays(300) }, NOW)).toBe('ok');
    expect(expiryStatus({ expiry: inDays(10) }, NOW)).toBe('expiring');
    expect(expiryStatus({ expiry: inDays(-1) }, NOW)).toBe('expired');
    // Today is the last good day, not the first expired one.
    expect(expiryStatus({ expiry: inDays(0) }, NOW)).toBe('expiring');
  });

  it('should floor the days and return null without a date', () => {
    expect(daysLeft(inDays(3), NOW)).toBe(3);
    expect(daysLeft(inDays(-3), NOW)).toBe(-3);
    expect(daysLeft('', NOW)).toBeNull();
    // The dashboard passes epoch milliseconds, not a Date.
    expect(daysLeft(inDays(3), NOW.getTime())).toBe(3);
  });

  it('should sort problems first, then newest', () => {
    const items = [
      { name: 'fine', expiry: inDays(300), createdAt: '2026-01-01T00:00:00Z' },
      { name: 'expired', expiry: inDays(-5), createdAt: '2026-01-01T00:00:00Z' },
      { name: 'soon', expiry: inDays(5), createdAt: '2026-01-01T00:00:00Z' },
      { name: 'undated', expiry: '', createdAt: '2026-01-01T00:00:00Z' },
    ];
    const order = sortForDisplay(items, NOW).map((x) => x.name);
    expect(order).toEqual(['expired', 'soon', 'undated', 'fine']);
  });
});

describe('searchInventory', () => {
  const items = [
    { name: 'Tris base', lot: 'SLBK1', location: 'fridge A2', note: '500 g' },
    { name: 'NaCl', lot: 'MK2', location: 'shelf 3', note: '' },
  ];

  it('should match name, lot, location and note case-insensitively', () => {
    expect(searchInventory(items, 'tris')).toHaveLength(1);
    expect(searchInventory(items, 'slbk1')).toHaveLength(1);
    expect(searchInventory(items, 'A2')).toHaveLength(1);
    expect(searchInventory(items, '500')).toHaveLength(1);
    expect(searchInventory(items, '  ')).toHaveLength(2);
    expect(searchInventory(items, 'zzz')).toHaveLength(0);
  });
});
