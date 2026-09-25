import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  detectLocale,
  lookup,
  makeTranslator,
  loadLocale,
  saveLocale,
  localeStoreKey,
  LOCALES,
  DEFAULT_LOCALE,
} from '../src/ui/i18n.mjs';
import { zh } from '../src/ui/locales/zh.mjs';
import { en } from '../src/ui/locales/en.mjs';
import { ELEMENT_CATEGORIES } from '../src/calc/elements.mjs';
import { ERA_KINDS } from '../src/calc/element-discovery.mjs';

describe('detectLocale', () => {
  it('should prefer a stored choice over the browser language', () => {
    expect(detectLocale('en-US', 'zh')).toBe('zh');
    expect(detectLocale('zh-CN', 'en')).toBe('en');
  });

  it('should match Chinese browser variants', () => {
    for (const l of ['zh', 'zh-CN', 'zh-Hans', 'zh-TW', 'ZH']) {
      expect(detectLocale(l, null), `${l} should map to zh`).toBe('zh');
    }
  });

  it('should fall back to English for any non-Chinese language', () => {
    for (const l of ['en-US', 'de', 'ja', 'fr-FR']) {
      expect(detectLocale(l, null), `${l} should map to en`).toBe('en');
    }
  });

  it('should ignore a stored value that is not a supported locale', () => {
    expect(detectLocale('en-US', 'klingon')).toBe('en');
  });

  it('should use the default when the browser language is unknown', () => {
    expect(detectLocale('', null)).toBe(DEFAULT_LOCALE);
    expect(detectLocale(undefined, null)).toBe(DEFAULT_LOCALE);
  });

  it('should only ever return a locale it supports', () => {
    for (const l of ['en', 'zh', 'de', '', null, undefined, 'xx-YY']) {
      expect(Object.keys(LOCALES)).toContain(detectLocale(l, null));
    }
  });
});

describe('locale persistence', () => {
  const store = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };

  it('should round-trip a choice', () => {
    const s = store();
    saveLocale(s, 'en');
    expect(loadLocale(s)).toBe('en');
  });

  it('should return null when nothing is stored', () => {
    expect(loadLocale(store())).toBeNull();
  });

  it('should not throw when storage is unavailable', () => {
    const hostile = { getItem: () => { throw new Error('nope'); }, setItem: () => { throw new Error('nope'); } };
    expect(loadLocale(hostile)).toBeNull();
    expect(saveLocale(hostile, 'en')).toBe(false);
  });

  it('should expose a versioned key so a format change can migrate', () => {
    expect(localeStoreKey()).toMatch(/\.v\d+$/);
  });
});

describe('lookup', () => {
  it('should resolve a dotted path', () => {
    expect(lookup({ tabs: { weigh: '称量' } }, 'tabs.weigh')).toBe('称量');
  });

  it('should return undefined for a missing path', () => {
    expect(lookup({ a: 1 }, 'a.b.c')).toBeUndefined();
    expect(lookup({}, 'nope')).toBeUndefined();
    expect(lookup(null, 'x')).toBeUndefined();
  });

  it('should return undefined when the path lands on a non-string', () => {
    expect(lookup({ a: { b: 1 } }, 'a.b')).toBeUndefined();
    expect(lookup({ a: ['x'] }, 'a')).toBeUndefined();
  });
});

describe('makeTranslator', () => {
  it('should translate a known key', () => {
    const t = makeTranslator({ hello: '你好' });
    expect(t('hello')).toBe('你好');
  });

  it('should fall back to the key itself when a translation is missing', () => {
    // Visible placeholder beats a blank panel: the former gets fixed.
    const t = makeTranslator({});
    expect(t('missing.key')).toBe('missing.key');
  });

  it('should use the fallback dictionary before giving up', () => {
    const t = makeTranslator({}, { only: 'fallback' });
    expect(t('only')).toBe('fallback');
  });

  it('should substitute params', () => {
    const t = makeTranslator({ greet: '你好，{name}！' });
    expect(t('greet', { name: '世界' })).toBe('你好，世界！');
  });

  it('should substitute the same param more than once', () => {
    const t = makeTranslator({ p: '{x} 和 {x}' });
    expect(t('p', { x: 'A' })).toBe('A 和 A');
  });

  it('should leave an unsupplied placeholder visible rather than printing undefined', () => {
    const t = makeTranslator({ p: '值：{v}' });
    expect(t('p', {})).toBe('值：{v}');
    expect(t('p')).toBe('值：{v}');
  });

  it('should stringify numeric params', () => {
    const t = makeTranslator({ p: '共 {n} 条' });
    expect(t('p', { n: 5 })).toBe('共 5 条');
  });
});

describe('locale dictionaries', () => {
  /** Flatten to dotted paths so two dictionaries can be compared. */
  const paths = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' ? paths(v, key) : [key];
  });

  it('should define both locales', () => {
    expect(zh).toBeTruthy();
    expect(en).toBeTruthy();
  });

  it('should cover exactly the same keys in both locales', () => {
    // A key present in one language and missing in the other ships a raw key
    // to half the users. Comparing the key sets is how that gets caught.
    const zhKeys = paths(zh).sort();
    const enKeys = paths(en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('should have no empty strings in either locale', () => {
    const walk = (obj, prefix = '') => {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object') walk(v, key);
        else expect(String(v).trim(), `${key} is empty`).not.toBe('');
      }
    };
    walk(zh);
    walk(en);
  });

  it('should translate every category the element table can produce', () => {
    // The element module grew a `metalloid` category and the label was missed,
    // so the legend rendered the raw key `elements.cat_metalloid` to users.
    // Tying the two together makes that omission a test failure.
    for (const c of ELEMENT_CATEGORIES) {
      for (const [name, dict] of [['zh', zh], ['en', en]]) {
        const label = dict.elements[`cat_${c}`];
        expect(label, `${name} elements.cat_${c}`).toBeTruthy();
        expect(label, `${name} elements.cat_${c}`).not.toBe(`elements.cat_${c}`);
      }
    }
  });

  it('should translate every era kind the discovery data can produce', () => {
    // Same failure mode as the missing category label above: a new era kind
    // would render as the raw key `elements.era_xxx` in the detail panel.
    // The data module owns the list, so the two cannot drift.
    for (const kind of ERA_KINDS) {
      for (const [name, dict] of [['zh', zh], ['en', en]]) {
        const label = dict.elements[`era_${kind}`];
        expect(label, `${name} elements.era_${kind}`).toBeTruthy();
        expect(label, `${name} elements.era_${kind}`).not.toBe(`elements.era_${kind}`);
        // Each era sentence interpolates its year; a template without the
        // placeholder would silently drop the number.
        expect(label, `${name} elements.era_${kind} is missing {years}`).toContain('{years}');
      }
    }
  });

  it('should translate the discovery fields the detail panel reads', () => {
    for (const key of ['discoveredBy', 'firstUsedBy', 'ancientEra', 'discoverySource']) {
      for (const [name, dict] of [['zh', zh], ['en', en]]) {
        expect(dict.elements[key], `${name} elements.${key}`).toBeTruthy();
      }
    }
    expect(zh.elements.ancientEra).toContain('{era}');
    expect(en.elements.ancientEra).toContain('{era}');
  });

  it('should translate every block and colour-by option the table offers', () => {
    for (const key of ['block_s', 'block_p', 'block_d', 'block_f', 'by_block']) {
      expect(zh.elements[key], `zh elements.${key}`).toBeTruthy();
      expect(en.elements[key], `en elements.${key}`).toBeTruthy();
    }
    for (const key of ['unit_mass', 'unit_rcow', 'unit_rvdw', 'matchCount']) {
      expect(zh.elements[key], `zh elements.${key}`).toBeTruthy();
      expect(en.elements[key], `en elements.${key}`).toBeTruthy();
    }
  });

  it('should translate every error code the calc layer can throw', () => {
    // A code with no translation renders as the raw code to the user, which is
    // how an untranslated error reaches someone mid-experiment. The calc layer
    // is scanned rather than listed, so a new fail() call is covered the moment
    // it is written.
    const dir = new URL('../src/calc/', import.meta.url);
    const codes = new Set();
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
      const src = readFileSync(new URL(file, dir), 'utf8');
      for (const m of src.matchAll(/fail\(\s*'([a-zA-Z]+)'/g)) codes.add(m[1]);
      for (const m of src.matchAll(/code:\s*'([a-zA-Z]+)'/g)) codes.add(m[1]);
    }
    expect(codes.size).toBeGreaterThan(20);
    for (const code of codes) {
      expect(zh.errors[code], `zh errors.${code}`).toBeTruthy();
      expect(en.errors[code], `en errors.${code}`).toBeTruthy();
    }
  });

  it('should have identical placeholder sets for each key', () => {
    // A translation that drops {n} renders a sentence with a number missing.
    const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const walk = (a, b, prefix = '') => {
      for (const [k, v] of Object.entries(a)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object') walk(v, b[k] ?? {}, key);
        else expect(placeholders(b[k]), `${key} placeholders differ`).toEqual(placeholders(v));
      }
    };
    walk(zh, en);
  });
});

describe('converter dimensions', () => {
  it('should label every dimension the converter offers', async () => {
    // The picker builds its labels from the dimension key. A dimension with no
    // label renders as the raw key `convert.dim_pressure` in the dropdown,
    // which is the same failure the missing category label had.
    const { SHOWN_DIMENSIONS } = await import('../src/ui/tabs/ConvertTab.jsx');
    expect(SHOWN_DIMENSIONS.length).toBeGreaterThan(10);
    for (const dim of SHOWN_DIMENSIONS) {
      for (const [name, dict] of [['zh', zh], ['en', en]]) {
        const label = dict.convert[`dim_${dim}`];
        expect(label, `${name} convert.dim_${dim}`).toBeTruthy();
        expect(label, `${name} convert.dim_${dim}`).not.toBe(`convert.dim_${dim}`);
      }
    }
  });

  it('should offer every dimension the units module defines', async () => {
    // A dimension added to the module but not to the screen is unreachable —
    // the units exist and no picker will ever show them.
    const { SHOWN_DIMENSIONS } = await import('../src/ui/tabs/ConvertTab.jsx');
    const { DIMENSIONS } = await import('../src/calc/units.mjs');
    for (const dim of Object.keys(DIMENSIONS)) {
      expect(SHOWN_DIMENSIONS, `${dim} is defined but not offered`).toContain(dim);
    }
  });

  it('should label every calculator example it offers', () => {
    // The chips are rendered from a key list, so a key with no string renders
    // as the key itself.
    for (let i = 1; i <= 6; i++) {
      const key = `calcEx${i}`;
      for (const [name, dict] of [['zh', zh], ['en', en]]) {
        expect(dict.convert[key], `${name} convert.${key}`).toBeTruthy();
        expect(dict.convert[key], `${name} convert.${key}`).not.toBe(`convert.${key}`);
      }
    }
  });

  it('should translate the calculator mode labels', () => {
    for (const key of ['mode_convert', 'mode_calc', 'calcLabel', 'calcHint', 'calcPlaceholder']) {
      for (const [name, dict] of [['zh', zh], ['en', en]]) {
        expect(dict.convert[key], `${name} convert.${key}`).toBeTruthy();
      }
    }
  });
});

/**
 * Every key a component asks for must exist.
 *
 * `t()` falls back to the key itself, which is the right behaviour at runtime —
 * a placeholder in the UI beats a blank panel — but it means a typo ships
 * silently. This was not hypothetical: the calculator drawer was written with
 * `t('calc.title')` while the strings live under `convert.calcTitle`, and the
 * button rendered the literal text "calc.open" in the topbar. The existing
 * tests here all check hand-listed keys, so none of them could see it.
 *
 * The scan reads the literal keys out of `t('...')` calls. Keys built at
 * runtime from a template are invisible to it by construction — those are
 * covered by the enumerated tests above, and a key assembled from a variable
 * cannot be checked without running the component.
 */
describe('translation keys', () => {
  const DIRS = ['src/ui/tabs', 'src/ui/components', 'src/ui'];
  const KEY = /\bt\(\s*'([a-zA-Z][\w.]*)'/g;

  /** Keys that are built at runtime and so cannot be read from source. */
  const DYNAMIC = /^(tabs|convert\.dim_|elements\.cat_|elements\.block_|elements\.era_|elements\.source_|theme\.|errors\.|material\.)/;

  function scanKeys() {
    const found = new Map();
    for (const dir of DIRS) {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.jsx') && !file.endsWith('.js')) continue;
        const path = `${dir}/${file}`;
        const src = readFileSync(path, 'utf8');
        for (const m of src.matchAll(KEY)) {
          if (!found.has(m[1])) found.set(m[1], path);
        }
      }
    }
    return found;
  }

  it('should resolve every literal key a component asks for', () => {
    const missing = [];
    for (const [key, path] of scanKeys()) {
      if (DYNAMIC.test(key)) continue;
      for (const [name, dict] of [['zh', zh], ['en', en]]) {
        if (lookup(dict, key) === undefined) missing.push(`${name}  ${key}  (${path})`);
      }
    }
    expect(missing, `keys referenced but not defined:\n${missing.join('\n')}`).toEqual([]);
  });

  it('should scan enough keys for that to mean something', () => {
    // Guards against the scan passing because its regex stopped matching.
    expect(scanKeys().size).toBeGreaterThan(100);
  });

  it('should catch a key the way the drawer typo was written', () => {
    // Proves the detector finds an absent key rather than merely reporting none.
    expect(lookup(zh, 'calc.title')).toBeUndefined();
    expect(lookup(en, 'calc.title')).toBeUndefined();
    expect(lookup(zh, 'convert.calcTitle')).toBe('计算器');
  });
});
