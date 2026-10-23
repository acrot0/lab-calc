import { describe, it, expect } from 'vitest';
import {
  TAB_ALIASES, scoreCandidates, entryHaystack, searchQuickJump, moveSelection,
} from '../src/ui/quick-jump.mjs';
import { zh } from '../src/ui/locales/zh.mjs';
import { en } from '../src/ui/locales/en.mjs';
import { makeTranslator } from '../src/ui/i18n.mjs';

const t = makeTranslator(zh);
const tabs = [
  { id: 'weigh' }, { id: 'dilute' }, { id: 'buffer' },
  { id: 'series' }, { id: 'stats' }, { id: 'physical' },
];

const entry = (id, kind, inputs = {}) => ({
  id, kind, inputs, outputs: {}, at: '2026-10-24T00:00:00.000Z',
  summary: '', meta: { sample: 'EXP-1' },
});

describe('scoreCandidates', () => {
  it('should match a prefix ahead of a buried substring', () => {
    expect(scoreCandidates('buf', ['buffer recipe', 'the buffer']))
      .toBeLessThan(scoreCandidates('buf', ['the buffer']));
  });

  it('should be case-insensitive in both directions', () => {
    expect(scoreCandidates('BUF', ['buffer'])).not.toBeNull();
    expect(scoreCandidates('buf', ['BUFFER'])).not.toBeNull();
  });

  it('should return null when nothing matches or the query is blank', () => {
    expect(scoreCandidates('xyz', ['buffer'])).toBeNull();
    expect(scoreCandidates('', ['buffer'])).toBeNull();
    expect(scoreCandidates('  ', ['buffer'])).toBeNull();
  });
});

describe('TAB_ALIASES', () => {
  it('should give every tab in the app an alias set', () => {
    const appIds = [
      'weigh', 'dilute', 'buffer', 'series', 'ph', 'percent', 'curve', 'reagent',
      'spectro', 'lab', 'colligative', 'convert', 'reaction', 'electro',
      'elements', 'bio', 'uncertainty', 'stats', 'analytical', 'physical',
    ];
    for (const id of appIds) {
      expect(Array.isArray(TAB_ALIASES[id]), `${id} has no aliases`).toBe(true);
      expect(TAB_ALIASES[id].length, `${id} has empty aliases`).toBeGreaterThan(0);
    }
  });

  it('should not name a tab the app does not have', () => {
    const appIds = new Set([
      'weigh', 'dilute', 'buffer', 'series', 'ph', 'percent', 'curve', 'reagent',
      'spectro', 'lab', 'colligative', 'convert', 'reaction', 'electro',
      'elements', 'bio', 'uncertainty', 'stats', 'analytical', 'physical',
    ]);
    for (const id of Object.keys(TAB_ALIASES)) {
      expect(appIds.has(id), `${id} is aliased but not a tab`).toBe(true);
    }
  });
});

describe('searchQuickJump', () => {
  it('should show every tab in order when the query is empty', () => {
    const r = searchQuickJump(tabs, [], '', t);
    expect(r.tabs.map((x) => x.id)).toEqual(tabs.map((x) => x.id));
    expect(r.history).toEqual([]);
  });

  it('should find a tab by its Chinese title', () => {
    const r = searchQuickJump(tabs, [], '缓冲', t);
    expect(r.tabs.map((x) => x.id)).toContain('buffer');
  });

  it('should find a tab by an English alias from the Chinese UI', () => {
    const r = searchQuickJump(tabs, [], 'statistics', t);
    expect(r.tabs.map((x) => x.id)).toContain('stats');
  });

  it('should find a tab by its id', () => {
    const r = searchQuickJump(tabs, [], 'physical', t);
    expect(r.tabs.map((x) => x.id)).toContain('physical');
  });

  it('should rank a title hit above an alias hit', () => {
    const r = searchQuickJump(tabs, [], '稀释', t);
    expect(r.tabs[0].id).toBe('dilute');
  });

  it('should search history by summary, metadata and inputs', () => {
    const entries = [
      entry('a', 'dilution', { stockConc: '1 mol/L' }),
      entry('b', 'weigh', { formula: 'NaCl' }),
      entry('c', 'buffer', {}),
    ];
    const byInput = searchQuickJump(tabs, entries, 'nacl', t);
    expect(byInput.history.map((x) => x.id)).toEqual(['b']);

    const byMeta = searchQuickJump(tabs, entries, 'exp-1', t);
    expect(byMeta.history.length).toBe(3);
  });

  it('should cap each list', () => {
    const many = Array.from({ length: 40 }, (_, i) => entry(`e${i}`, 'weigh', {}));
    const r = searchQuickJump(tabs, many, '称量', t);
    expect(r.tabs.length).toBeLessThanOrEqual(7);
    expect(r.history.length).toBeLessThanOrEqual(6);
  });

  it('should survive hostile inputs', () => {
    expect(() => searchQuickJump(null, null, null, null)).not.toThrow();
    expect(() => searchQuickJump([null], [null], 'x', t)).not.toThrow();
    expect(searchQuickJump(null, null, null, null)).toEqual({ tabs: [], history: [] });
  });

  it('should work from the English locale too', () => {
    const te = makeTranslator(en);
    const r = searchQuickJump(tabs, [], 'serial', te);
    expect(r.tabs.map((x) => x.id)).toContain('series');
  });

  it('should switch history search to tag mode on a leading #', () => {
    const entries = [
      entry('a', 'weigh', { formula: 'NaCl' }),
      { ...entry('b', 'dilution'), note: 'cloudy #失败 redone' },
      { ...entry('c', 'buffer'), note: '#失败 #重做' },
    ];
    const r = searchQuickJump(tabs, entries, '#失败', t);
    expect(r.tabs).toEqual([]); // a tag names a record, not a calculator
    expect(r.history.map((x) => x.id).sort()).toEqual(['b', 'c']);
  });

  it('should find tagged records without the # through the note text', () => {
    const entries = [{ ...entry('c', 'buffer'), note: '#重做' }];
    const r = searchQuickJump(tabs, entries, '重做', t);
    expect(r.history.map((x) => x.id)).toEqual(['c']);
  });
});

describe('entryHaystack', () => {
  it('should include the metadata values and the input JSON', () => {
    const hay = entryHaystack(entry('a', 'weigh', { formula: 'KBr' }), '称取 KBr')
      .join(' ').toLowerCase();
    expect(hay).toContain('exp-1');
    expect(hay).toContain('kbr');
  });
});

describe('moveSelection', () => {
  it('should move and wrap in both directions', () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
  });

  it('should clamp an out-of-range cursor', () => {
    expect(moveSelection(99, 0, 3)).toBe(0);
    expect(moveSelection(undefined, 1, 3)).toBe(1);
  });

  it('should not divide by zero', () => {
    expect(moveSelection(0, 1, 0)).toBe(0);
  });
});
