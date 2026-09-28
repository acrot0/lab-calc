import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { zh } from '../src/ui/locales/zh.mjs';
import { en } from '../src/ui/locales/en.mjs';
import { KIND_TO_TAB } from '../src/ui/history.mjs';
import { formulaOf } from '../src/calc/data/formulas.mjs';
import { toMarkdown } from '../src/ui/export.mjs';

/*
 * The four registries a recorded kind has to appear in, checked together.
 *
 * A record's `kind` is a stored value, and four separate tables answer
 * questions about it:
 *
 *   `kinds.*` in the locale files  - what the record is called
 *   `KIND_TO_TAB`                  - which tab re-runs it
 *   `FORMULAS` (via KIND_ALIASES)  - the equation and assumptions to print
 *   `fieldLabel`                   - what each field inside it is called
 *
 * Each is consulted from a different file, and **each was complete for the
 * fourteen original kinds and incomplete for the five added later**. Nothing
 * failed: a missing label degrades to the raw key, which reads as data rather
 * than as an error. That is the shape of every bug in this file, so the check
 * is one test that walks the kinds once and reports all four columns.
 *
 * ## Why the kinds are read from source
 *
 * `onRecord({ kind: 'bio' })` is a literal at the call site, so the set of
 * kinds the app can produce is readable without running it. Read narrowly —
 * anchored on `onRecord(` — because `kind:` is also how the glassware tables
 * spell their own discriminator (`kind: 'burette'` in `instruments.mjs`), and
 * a loose match sweeps those in as if they were record kinds.
 */

const TABS = path.resolve(import.meta.dirname, '../src/ui/tabs');

/** Every kind a shipped tab can hand to `onRecord`. */
function recordedKinds() {
  const out = new Map();
  for (const file of fs.readdirSync(TABS)) {
    if (!file.endsWith('.jsx')) continue;
    const src = fs.readFileSync(path.join(TABS, file), 'utf8');
    for (const m of src.matchAll(/onRecord\(\{[\s\S]{0,120}?kind:\s*'([A-Za-z]+)'/g)) {
      if (!out.has(m[1])) out.set(m[1], []);
      out.get(m[1]).push(file);
    }
  }
  return out;
}

/**
 * The alias table `Report.jsx` resolves through.
 *
 * Copied rather than imported: `Report.jsx` is a component and importing it
 * would drag React into a test about strings. The copy is what makes the
 * report's behaviour visible here — and the test below asserts the file still
 * contains the table, so the copy cannot drift in silence.
 */
const KIND_ALIASES = {
  massForMolarity: 'weigh', stockFromSolid: 'weigh', dilution: 'dilute',
  dilutionSeries: 'series', bufferRecipe: 'buffer', phCalc: 'ph',
  percentSolution: 'percent', titrationCurve: 'titrationCurve',
};

const RECORDED = recordedKinds();
const KINDS = [...RECORDED.keys()].sort();

describe('every recorded kind is complete in all four registries', () => {
  it('should find the kinds, so a broken matcher cannot pass this file', () => {
    expect(RECORDED.size, 'no kinds were found — the matcher is broken').toBeGreaterThan(15);
    // The glassware discriminators must NOT be in here: they are `kind:` too,
    // and treating them as record kinds would demand a label for `burette`.
    for (const notAKind of ['burette', 'pipette', 'flask']) {
      expect(KINDS, `${notAKind} is a glassware discriminator, not a record kind`)
        .not.toContain(notAKind);
    }
  });

  it('should name every kind in both locales', () => {
    // A kind with no name renders as the key itself wherever it is shown. In
    // the printed report that is the record's own heading.
    const missing = KINDS.filter((k) => !zh.kinds[k] || !en.kinds[k]);
    expect(missing, `no name for: ${missing.join(', ')}`).toEqual([]);

    // And the name must not be the key, or the "translation" is a fallback.
    const raw = KINDS.filter((k) => zh.kinds[k] === k || en.kinds[k] === k);
    expect(raw, `name is the raw key: ${raw.join(', ')}`).toEqual([]);
  });

  it('should give every kind a replay route', () => {
    // Without one the history's replay button is present, enabled and inert.
    const missing = KINDS.filter((k) => !KIND_TO_TAB[k]);
    expect(missing, `no replay route for: ${missing.join(', ')}`).toEqual([]);
  });

  it('should point every replay route at a tab that exists', () => {
    const app = fs.readFileSync(path.resolve(TABS, '../App.jsx'), 'utf8');
    const tabIds = new Set([...app.matchAll(/\{\s*id:\s*'([a-z]+)',\s*icon:/g)].map((m) => m[1]));
    expect(tabIds.size, 'no tab ids were found in App.jsx').toBeGreaterThan(15);
    for (const k of KINDS) {
      expect(tabIds.has(KIND_TO_TAB[k]), `${k} -> ${KIND_TO_TAB[k]}, which is not a tab`).toBe(true);
    }
  });

  it('should declare the equation and assumptions for every kind', () => {
    // This is what the printed report's 「计算方法」 section is built from. A
    // kind with no entry prints its numbers with no statement of the
    // relationship that produced them or the conditions they hold under.
    const formulaFor = (k) => formulaOf(k) ?? formulaOf(KIND_ALIASES[k]);
    const missing = KINDS.filter((k) => !formulaFor(k));
    expect(missing, `no formula registry entry for: ${missing.join(', ')}`).toEqual([]);
  });

  it('should keep the alias table in Report.jsx in step with this file', () => {
    // The copy above is only a faithful stand-in while the real table has the
    // same members.
    const src = fs.readFileSync(path.resolve(TABS, '../components/Report.jsx'), 'utf8');
    for (const [kind, tab] of Object.entries(KIND_ALIASES)) {
      expect(src, `Report.jsx no longer aliases ${kind} -> ${tab}`)
        .toMatch(new RegExp(`${kind}:\\s*'${tab}'`));
    }
  });

  it('should not resolve a kind to a tab id by accident', () => {
    /*
     * `Report.jsx` used `t(\`tabs.${entry.kind}\`)`, which is right only for
     * the five kinds whose stored name happens to equal its tab id. For the
     * other eight it rendered the key. Both blocks exist in the locale files
     * with overlapping names, so the mistake is invisible in the source.
     */
    const src = fs.readFileSync(path.resolve(TABS, '../components/Report.jsx'), 'utf8');
    expect(src, 'Report.jsx resolves a kind through the tab-id block again')
      .not.toMatch(/t\(`tabs\.\$\{/);
  });
});

describe('the exported Type column', () => {
  it('should name every kind in both languages', () => {
    // The Type column is the one column that says what a row even is. A kind
    // it cannot name exports as `bio`, in a file that leaves the app.
    const rows = KINDS.map((k, i) => ({ id: String(i), at: '2026-09-27T10:00:00Z', kind: k, summary: '' }));
    for (const locale of ['zh', 'en']) {
      const cells = toMarkdown(rows, locale).split('\n')
        .filter((l) => l.startsWith('| 2026')).map((l) => l.split('|')[2].trim());
      const raw = KINDS.filter((k, i) => cells[i] === k);
      expect(raw, `${locale}: Type column shows the raw kind for ${raw.join(', ')}`).toEqual([]);
    }
  });

  it('should agree with the locale files', () => {
    // One wording, not two. The export had its own table and the locale files
    // had another; they disagreed for exactly the five kinds added last.
    const rows = [{ id: '1', at: '2026-09-27T10:00:00Z', kind: 'bio', summary: '' }];
    const cell = toMarkdown(rows, 'zh').split('\n').find((l) => l.startsWith('| 2026')).split('|')[2].trim();
    expect(cell).toBe(zh.kinds.bio);
  });
});

describe('the README feature table', () => {
  /*
   * Both READMEs carry a table with one row per tab. It had 16 rows against 20
   * tabs — biology, uncertainty, lab data and physical chemistry were missing
   * — and nothing could have caught it: the README is prose, and prose about
   * the product is unverified by construction.
   *
   * This is the cheapest possible guard: the tab ids are in `App.jsx`, the
   * rows are in the README, and the two counts have to match. It does not
   * check that a row *describes* its tab well — that is a judgement — only
   * that no tab is missing from the list a reader uses to decide whether the
   * app does what they need.
   */
  const APP = fs.readFileSync(path.resolve(TABS, '../App.jsx'), 'utf8');
  const TAB_COUNT = [...APP.matchAll(/Component:\s*\w+Tab/g)].length;

  it('should have found the tabs in App.jsx', () => {
    expect(TAB_COUNT, 'the App.jsx tab table was not matched').toBeGreaterThan(15);
  });

  for (const [file, header, end] of [
    ['README.md', '| 标签页 | 算什么 |', '历史记录可导出为'],
    ['README.en.md', '| Tab | What it works out |', 'History exports as'],
  ]) {
    it(`should list every tab in ${file}`, () => {
      const src = fs.readFileSync(path.resolve(TABS, '../../../', file), 'utf8');
      const from = src.indexOf(header);
      expect(from, `${file} has no feature table`).toBeGreaterThan(-1);
      const to = src.indexOf(end, from);
      const rows = [...src.slice(from, to).matchAll(/^\| \*\*[^*]+\*\* \|/gm)].length;
      expect(rows, `${file} documents ${rows} of ${TAB_COUNT} tabs`).toBe(TAB_COUNT);
    });
  }
});
