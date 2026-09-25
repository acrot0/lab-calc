import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fieldLabel, LABELLED_KEYS, SYMBOL_KEYS } from '../src/ui/field-labels.mjs';

/*
 * The report prints a record's `inputs` and `outputs`, keyed by the names the
 * calculation modules use. `fieldLabel` falls back to the raw key, so an
 * unlabelled field still appears — visible and fixable rather than silently
 * dropped. That fallback is a safety net, not a plan: this file asserts the
 * net is never needed, because the failure it prevents is a printed report
 * handed to a supervisor that reads `massG   14.61`.
 *
 * ## How the keys are collected
 *
 * By *calling the calculation modules* and reading the keys of what they
 * return, rather than by matching source text. The first two attempts at this
 * test matched text and both were wrong in opposite directions: matching
 * `onRecord({ inputs, outputs })` found almost nothing (both are variables at
 * the call site), and matching every `return {` found too much (it picked up
 * internal helpers like `{ x, y }` and flagged 84 keys that never reach a
 * record). Running the code is the only version that cannot be wrong about
 * which keys are real.
 */

const UI = path.resolve(import.meta.dirname, '../src/ui');

/** Every .jsx/.mjs file under a directory, recursively. */
function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return filesUnder(p);
    return /\.(jsx|mjs)$/.test(e.name) ? [p] : [];
  });
}

/**
 * Input keys, read from the tab literals.
 *
 * Unlike outputs these really are literals at the call site
 * (`const inputs = { formula, molarity: n(molarity), volumeMl: n(volume) }`),
 * so a textual match is accurate here. Only `const inputs = {` is matched —
 * not every object literal — which is what keeps this from over-reaching the
 * way the output matcher did.
 */
function inputKeys() {
  const keys = new Set();
  for (const file of filesUnder(UI)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/const\s+inputs\s*=\s*\{([^}]*)\}/gs)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(':')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) keys.add(name);
      }
    }
  }
  return keys;
}

/** A representative argument set per calculation, so each can actually run. */
const CALLS = [
  ['solution.mjs', 'massForMolarity', { formula: 'NaCl', molarity: 0.5, volumeMl: 500 }],
  ['solution.mjs', 'stockFromSolid', { formula: 'NaOH', molarity: 1, volumeMl: 1000 }],
  ['solution.mjs', 'dilution', { stockConc: 1, targetConc: 0.1, targetVolumeMl: 100 }],
  ['buffer.mjs', 'bufferRecipe', { pKa: 4.76, targetPh: 5.76 }],
  ['buffer.mjs', 'dilutionSeries', { stockConc: 1000, factor: 10, steps: 3 }],
  ['buffer.mjs', 'hendersonHasselbalch', { pKa: 4.76, acidConc: 0.1, baseConc: 0.1 }],
  ['titration.mjs', 'weakAcidPh', { pKa: 4.76, conc: 0.1 }],
  ['titration.mjs', 'weakBasePh', { pKb: 4.75, conc: 0.1 }],
  ['titration.mjs', 'equivalenceVolume', { analyteConc: 0.1, analyteVolumeMl: 25, titrantConc: 0.1 }],
  ['titration.mjs', 'preparePercentSolution', { percent: 10, volumeMl: 250 }],
];

/** Output keys, from what the modules actually return. */
async function outputKeys() {
  const keys = new Set();
  const byModule = new Map();
  for (const [mod] of CALLS) {
    if (!byModule.has(mod)) {
      // eslint-disable-next-line no-await-in-loop
      byModule.set(mod, await import(`../src/calc/${mod}`));
    }
  }
  for (const [mod, fn, args] of CALLS) {
    const f = byModule.get(mod)[fn];
    if (typeof f !== 'function') continue;
    const out = f(args);
    if (out && typeof out === 'object' && !Array.isArray(out)) {
      for (const k of Object.keys(out)) keys.add(k);
    } else if (Array.isArray(out) && out[0] && typeof out[0] === 'object') {
      for (const k of Object.keys(out[0])) keys.add(k);
    }
  }
  return keys;
}

describe('fieldLabel', () => {
  it('should return the Chinese label for a known key', () => {
    expect(fieldLabel('massG', 'zh')).toBe('质量 (g)');
  });

  it('should return the English label for a known key', () => {
    expect(fieldLabel('massG', 'en')).toBe('Mass (g)');
  });

  it('should fall back to the raw key rather than an empty string', () => {
    // An unlabelled field must stay visible in the report. Returning '' would
    // drop it silently, which is data loss nobody would notice.
    expect(fieldLabel('someUnmappedKey', 'zh')).toBe('someUnmappedKey');
  });

  it('should default to Chinese', () => {
    expect(fieldLabel('molarity')).toBe(fieldLabel('molarity', 'zh'));
  });

  it('should give every labelled key both locales, non-empty and distinct from the key', () => {
    for (const key of LABELLED_KEYS) {
      const zh = fieldLabel(key, 'zh');
      const en = fieldLabel(key, 'en');
      expect(zh, `${key} zh`).toBeTruthy();
      expect(en, `${key} en`).toBeTruthy();
      // A label identical to the key is usually the fallback wearing a
      // costume. A few keys are symbols that read the same in both languages
      // (`pKa`), and those are listed explicitly rather than excused here —
      // so the rule stays strict for everything else.
      if (SYMBOL_KEYS.has(key)) continue;
      expect(zh, `${key} zh is the raw key`).not.toBe(key);
      expect(en, `${key} en is the raw key`).not.toBe(key);
    }
  });
});

describe('coverage', () => {
  it('should label every input key the tabs record', () => {
    const recorded = inputKeys();
    // Guard against the matcher silently finding nothing, which would make
    // this test pass while checking nothing at all.
    expect(recorded.size, 'no input keys were found — the matcher is broken')
      .toBeGreaterThan(10);

    const unlabelled = [...recorded].filter((k) => !LABELLED_KEYS.includes(k)).sort();
    expect(unlabelled, `these inputs would print as raw keys: ${unlabelled.join(', ')}`)
      .toEqual([]);
  });

  it('should label every output key the calculation modules return', async () => {
    const produced = await outputKeys();
    expect(produced.size, 'no output keys were found — the calls did not run')
      .toBeGreaterThan(10);

    const unlabelled = [...produced].filter((k) => !LABELLED_KEYS.includes(k)).sort();
    expect(unlabelled, `these results would print as raw keys: ${unlabelled.join(', ')}`)
      .toEqual([]);
  });
});
