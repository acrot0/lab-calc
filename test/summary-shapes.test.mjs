import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeTranslator } from '../src/ui/i18n.mjs';
import { zh } from '../src/ui/locales/zh.mjs';
import { recordSummary } from '../src/ui/summaries.mjs';

/*
 * The history line for every record shape the tabs actually write.
 *
 * A summary is built from `inputs` and `outputs` by name, and a name that is
 * not there renders as `undefined` rather than throwing — `fmt(undefined)`
 * returns `'?'` and a missing string interpolates as the word itself. So a
 * mismatch between what a tab stores and what its summary reads produces a
 * plausible-looking sentence with holes in it, in the one place a user looks
 * to remember what they did.
 *
 * Two were found this way and neither was caught by anything:
 *
 *   stats      the tab passed the whole nested result where the summary wanted
 *              flat `mean`/`sd`/`n` → 「n = undefined，均值 ?，标准差 ?」
 *   curve      the measured mode stores `volumeMl`/`method` where the model
 *              mode stores `equivalenceMl`/`equivalencePh` → 「滴定曲线：
 *              undefined mol/L ... undefined mL，等当点 ? mL / pH ?」
 *
 * Both are the same mistake in different clothes: the tab and the summary
 * disagreeing about the shape of an object they both call `outputs`. The cases
 * below are the record each tab writes, taken from the tab's own `onRecord`
 * call, so a change to one of those calls fails here.
 */

const t = makeTranslator(zh);

/** What the tab hands to `onRecord`, per the call site. */
const RECORDS = {
  stats: {
    inputs: { seriesA: '10.02, 10.05, 9.98', seriesB: '', confidence: '95' },
    outputs: { mean: 10.0167, sd: 0.0351, n: 3 },
  },
  'curve (model)': {
    inputs: { acidType: 'weakAcid', pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.1 },
    outputs: { equivalenceMl: 25, equivalencePh: 8.73 },
  },
  'curve (measured)': {
    inputs: {
      mode: 'measured',
      rowsText: '0, 2.88\n20, 4.58\n40, 5.36\n50, 9.01\n70, 12.22',
      initialVolumeMl: 0,
    },
    outputs: { volumeMl: 49.624, method: 'derivative', granR2: 0.99946 },
  },
};

const summaryOf = (name) => recordSummary({ kind: 'titrationCurve', ...RECORDS[name] }, t);

describe('the history line for each record shape', () => {
  it('should have cases to check, and they should be the real ones', () => {
    // Guard against this file passing because it checks nothing.
    expect(Object.keys(RECORDS).length).toBeGreaterThan(2);

    // The shapes below were copied from the tabs. If a call site changes, the
    // copy is stale and this test would be reassuring for the wrong reason.
    const curve = readFileSync('src/ui/tabs/CurveTab.jsx', 'utf8');
    expect(curve, 'CurveTab no longer records rowsText').toContain('rowsText');
    const stats = readFileSync('src/ui/tabs/StatsTab.jsx', 'utf8');
    expect(stats, 'StatsTab no longer records a flat mean').toMatch(/mean: result\.describeA\.mean/);
  });

  it('should not leave a hole where a number belongs', () => {
    /*
     * `undefined` and `?` are the two shapes a missing value takes: the first
     * from a string interpolation, the second from `fmt`. A summary containing
     * either is describing a record it cannot read.
     */
    for (const name of Object.keys(RECORDS)) {
      const line = recordSummary({ kind: name.startsWith('curve') ? 'titrationCurve' : name, ...RECORDS[name] }, t);
      expect(line, `${name}: ${line}`).not.toMatch(/undefined/);
      expect(line, `${name}: ${line}`).not.toMatch(/\?/);
    }
  });

  it('should derive the summary from the object being stored', () => {
    /*
     * The stats defect in one assertion: the same object has to reach both
     * `outputs` and the summary, or they can disagree. Stated as code rather
     * than as a comment because the comment was there and it still happened.
     */
    const src = readFileSync('src/ui/tabs/StatsTab.jsx', 'utf8');
    expect(src, 'StatsTab is summarising a different object than it stores')
      .toMatch(/outputs,\s*\n\s*summary: recordSummary\(\{ kind: 'stats', inputs: \{[^}]*\}, outputs \}/);
  });

  it('should name the measured titration as a measurement, not a prediction', () => {
    // The two modes answer different questions. A line that says "0.1 mol/L
    // weak acid, 25 mL" for a record that contains no acid at all is wrong
    // about what was calculated, which is the one thing the line is for.
    expect(summaryOf('curve (measured)')).toContain('实测');
    expect(summaryOf('curve (measured)')).toContain('49.62');
    expect(summaryOf('curve (model)')).toContain('滴定曲线');
  });
});
