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

  /*
   * A hint that names a source must not also tell the correction story.
   *
   * `elements.discoverySource` shipped as "发现年份：以「分离出单质」为准，人工
   * 校订——PubChem 把铝和钙标成「古代」，是错的" — a changelog entry in a
   * user-facing caption. The correction belongs in the module docstring and
   * NOTICE.md, which is where the reader who cares about provenance looks; a
   * student checking aluminium's year does not need to be told that PubChem
   * was wrong, and a caption that reads as an internal note makes the rest of
   * the panel look like one.
   *
   * The sibling hints set the convention: "原子量来源：{source}" and
   * "物性数据来源：PubChem（公有领域）" name a source and stop.
   */
  it('should not narrate past mistakes in a user-facing hint', () => {
    // Phrases that only make sense to someone reading the repository's history.
    const NARRATION = [
      /是错的/, /标成/, /此前/, /原来/, /改(正|成)了/, /曾经/,
      /was wrong/, /used to/, /previously/, /incorrectly marked/, /we fixed/,
    ];
    const offenders = [];
    for (const [name, dict] of [['zh', zh], ['en', en]]) {
      for (const key of paths(dict)) {
        // Only the provenance captions: error messages legitimately explain
        // what the user did wrong, and that is a different thing.
        if (!/SourceNote$|Source$/.test(key)) continue;
        const value = key.split('.').reduce((o, k) => o?.[k], dict);
        if (typeof value !== 'string') continue;
        for (const re of NARRATION) {
          if (re.test(value)) offenders.push(`${name} ${key}: ${value.slice(0, 60)}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
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

  it('should place every offered dimension in exactly one group', async () => {
    /*
     * The picker groups its thirty-five dimensions under `<optgroup>` headings,
     * because a flat list that long is a wall to read rather than a list to
     * scan. The risk that introduces is a dimension in `DIMENSIONS_SHOWN` but
     * in no group — it would vanish from the converter silently, which is
     * worse than the flat list it replaced.
     *
     * "Exactly one" rather than "at least one": a dimension listed under two
     * headings appears twice in the dropdown, and the duplicate gives the same
     * answer from a different-looking place.
     */
    const { DIMENSIONS_SHOWN, DIMENSION_GROUPS } = await import('../src/ui/components/UnitConverter.jsx');
    const counts = new Map();
    for (const g of DIMENSION_GROUPS) {
      for (const d of g.dimensions) counts.set(d, (counts.get(d) ?? 0) + 1);
    }

    const missing = DIMENSIONS_SHOWN.filter((d) => !counts.has(d));
    expect(missing, `未分组: ${missing.join(', ')}`).toEqual([]);

    const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([d]) => d);
    expect(duplicated, `重复分组: ${duplicated.join(', ')}`).toEqual([]);

    // Nothing may be grouped that the converter does not offer either, or the
    // group renders empty and the heading promises options that are not there.
    const extra = [...counts.keys()].filter((d) => !DIMENSIONS_SHOWN.includes(d));
    expect(extra, `组里有未提供的维度: ${extra.join(', ')}`).toEqual([]);
  });

  it('should resolve every group heading from the locale files', async () => {
    // The heading is user-visible text like any other, so it comes from the
    // locales rather than from the component — the hardcoded-CJK guard rejects
    // the alternative. A key with no translation renders as the key itself, so
    // `convert.group_solution` would appear above the options.
    const { DIMENSION_GROUPS } = await import('../src/ui/components/UnitConverter.jsx');
    for (const g of DIMENSION_GROUPS) {
      for (const [name, dict] of [['zh', zh], ['en', en]]) {
        const value = dict.convert[g.label];
        expect(value, `${name} convert.${g.label}`).toBeTruthy();
        expect(value, `${name} convert.${g.label}`).not.toBe(g.label);
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

/*
 * Every field name that can reach the screen must be translatable.
 *
 * `errorMessage` renders a validator error's `name` through `fields.<name>`, so
 * a name with no entry shows the raw key — the user read
 * "fields.confidence 必须大于 0" on screen. The error-code test above scans for
 * codes but not for the names that travel inside them, which is how this got
 * through.
 *
 * The scan is over the calc sources rather than a hand-kept list, so a new
 * validator call is covered the moment it is written.
 *
 * Only names whose error message actually interpolates `{name}` are checked. A
 * `name` passed to an error that does not use it is bookkeeping for the
 * developer; flagging those would mean inventing translations for labels no
 * user ever sees, and that list grows with every new validator.
 */
describe('validator field names', () => {
  /** Codes whose zh translation interpolates {name}. */
  const nameRenderingCodes = new Set(
    Object.entries(zh.errors)
      .filter(([, msg]) => typeof msg === 'string' && msg.includes('{name}'))
      .map(([code]) => code),
  );

  it('should have at least one name-rendering error, or this test is vacuous', () => {
    // Guards against the pattern below silently matching nothing.
    expect(nameRenderingCodes.size).toBeGreaterThan(0);
  });

  it('should translate every field name a user can see', () => {
    const dir = new URL('../src/calc/', import.meta.url);
    const names = new Set();
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
      const src = readFileSync(new URL(file, dir), 'utf8');
      // requirePositive(x, 'name') — these always render, since the helper's
      // errors interpolate {name}.
      const req = /require(?:Positive|NonNegative|Finite)\([^,]+,\s*'([a-zA-Z][a-zA-Z0-9]*)'/g;
      for (const m of src.matchAll(req)) names.add(m[1]);
      // fail('code', { name: 'x' }) — only when that code renders {name}.
      const fails = /fail\(\s*'([a-zA-Z]+)',\s*\{([^}]*)\}/g;
      for (const m of src.matchAll(fails)) {
        if (!nameRenderingCodes.has(m[1])) continue;
        const nm = m[2].match(/name:\s*'([a-zA-Z][a-zA-Z0-9]*)'/);
        if (nm) names.add(nm[1]);
      }
    }
    expect(names.size).toBeGreaterThan(5);
    const missingZh = [...names].filter((n) => !zh.fields[n]).sort();
    expect(missingZh, `fields.* missing in zh: ${missingZh.join(', ')}`).toEqual([]);
    const missingEn = [...names].filter((n) => !en.fields[n]).sort();
    expect(missingEn, `fields.* missing in en: ${missingEn.join(', ')}`).toEqual([]);
  });
});
