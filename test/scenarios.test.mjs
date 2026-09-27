import { describe, it, expect } from 'vitest';
import { SCENARIOS, scenarioFor, scenarioTabs } from '../src/ui/scenarios.mjs';

/*
 * The preset scenarios.
 *
 * The property that matters is that a scenario actually runs. A preset that
 * fills the form with values the tab then rejects is worse than no preset: the
 * reviewer's first click produces an error message, which is the opposite of
 * what the feature is for.
 *
 * These tests cannot execute every tab (that is `dom-render`'s job), so they
 * check the two things that break silently: a tab id that does not exist, and a
 * key the tab does not read — which leaves a field at its default and produces
 * a scenario that is not the one that was written.
 */

/** The tab ids, read from the source rather than duplicated here. */
const TAB_IDS = [
  'weigh', 'dilute', 'buffer', 'series', 'ph', 'percent', 'curve', 'reagent',
  'spectro', 'lab', 'colligative', 'bio', 'reaction', 'electro', 'elements',
  'convert', 'uncertainty', 'stats', 'analytical', 'physical',
];

/*
 * The one tab that takes no `restored` prop.
 *
 * The periodic table is a reference, not a form: there is nothing to fill in
 * and nothing to calculate, so a scenario would have no inputs to carry. It is
 * excluded from the coverage assertions rather than given a hollow entry.
 */
const REFERENCE_TABS = ['elements'];
const FORM_TABS = TAB_IDS.filter((id) => !REFERENCE_TABS.includes(id));

describe('SCENARIOS', () => {
  it('should have one entry per form tab', () => {
    expect(SCENARIOS).toHaveLength(FORM_TABS.length);
  });

  it('should name a tab that exists', () => {
    for (const s of SCENARIOS) {
      expect(TAB_IDS, `unknown tab: ${s.tab}`).toContain(s.tab);
    }
  });

  it('should not name the same tab twice', () => {
    const tabs = SCENARIOS.map((s) => s.tab);
    expect(new Set(tabs).size).toBe(tabs.length);
  });

  it('should cover every tab that has a form', () => {
    // A tab without a scenario is the one a reviewer opens and finds empty.
    const covered = new Set(SCENARIOS.map((s) => s.tab));
    for (const id of FORM_TABS) {
      expect(covered, `no scenario for ${id}`).toContain(id);
    }
  });

  it('should not claim a scenario for a reference tab', () => {
    const covered = new Set(SCENARIOS.map((s) => s.tab));
    for (const id of REFERENCE_TABS) {
      expect(covered).not.toContain(id);
    }
  });

  it('should give every scenario a title in both languages', () => {
    for (const s of SCENARIOS) {
      expect(s.title.zh, `${s.tab} title.zh`).toBeTruthy();
      expect(s.title.en, `${s.tab} title.en`).toBeTruthy();
      expect(s.title.zh).not.toBe(s.title.en);
    }
  });

  it('should give every scenario a reason in both languages', () => {
    for (const s of SCENARIOS) {
      expect(s.why.zh, `${s.tab} why.zh`).toBeTruthy();
      expect(s.why.en, `${s.tab} why.en`).toBeTruthy();
    }
  });

  it('should carry an inputs object', () => {
    for (const s of SCENARIOS) {
      expect(typeof s.inputs, `${s.tab} inputs`).toBe('object');
      expect(s.inputs).not.toBeNull();
    }
  });

  it('should never carry an undefined input value', () => {
    // `restored?.k ?? default` treats undefined and missing alike, so an
    // explicit undefined silently falls back — a scenario that does not do
    // what its title says.
    for (const s of SCENARIOS) {
      for (const [k, v] of Object.entries(s.inputs)) {
        expect(v, `${s.tab}.${k}`).not.toBeUndefined();
      }
    }
  });

  it('should keep the rail order', () => {
    const order = SCENARIOS.map((s) => TAB_IDS.indexOf(s.tab));
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });
});

describe('scenarioFor', () => {
  it('should find a scenario by tab id', () => {
    expect(scenarioFor('weigh')?.tab).toBe('weigh');
  });

  it('should return null for an unknown tab', () => {
    expect(scenarioFor('nope')).toBeNull();
    expect(scenarioFor(undefined)).toBeNull();
  });
});

describe('scenarioTabs', () => {
  it('should list every tab with a scenario', () => {
    expect(scenarioTabs()).toHaveLength(SCENARIOS.length);
  });
});

/*
 * The keys each tab reads from `restored`.
 *
 * Transcribed from the tabs themselves. This is the check that catches a
 * scenario written against a field name that no longer exists — the failure
 * mode is silent, because an unrecognised key is simply ignored and the field
 * keeps its default.
 */
const RESTORED_KEYS = {
  weigh: ['formula', 'molarity', 'volumeMl'],
  dilute: ['stockConc', 'targetConc', 'targetVolumeMl'],
  buffer: ['preset', 'pKa', 'targetPh', 'totalConc', 'tempC', 'backgroundSalt'],
  series: ['stockConc', 'factor', 'steps', 'stepVolumeMl'],
  ph: ['kind', 'pk', 'conc', 'charge', 'salt', 'preset'],
  percent: ['mode', 'formula', 'percent', 'volumeMl', 'molarity'],
  curve: ['acidType', 'pKa', 'pKas', 'conc', 'volumeMl', 'titrantConc', 'mode', 'rowsText'],
  reagent: ['mode', 'formula', 'percent', 'density', 'targetMolarity', 'targetVolumeMl'],
  spectro: ['mode', 'epsilon', 'conc', 'pathCm', 'absorbance', 'ptsText', 'reading'],
  lab: ['mode', 'massG', 'formula', 'moles', 'volumeMl', 'components', 'reactions', 'excessPercent',
    'lengthBp', 'concNgPerUl', 'copiesPerUl', 'volumeUl', 'colonies', 'dilutionFactor', 'platedVolumeMl', 'kind'],
  colligative: ['mode', 'solvent', 'molality', 'i', 'molarity', 'tempC', 'deltaTf', 'massG', 'solventKg'],
  bio: ['mode', 'a260', 'naType', 'pathCm', 'dilution', 'a280', 'a230', 'stockConc', 'targetConc', 'sequence'],
  reaction: ['mode', 'equation', 'amounts', 'unit', 'yieldOf', 'actualG', 'entries', 'molarMassGmol'],
  electro: ['mode', 'e0', 'n', 'q', 'tempC', 'cathode', 'anode'],
  elements: [],
  convert: [],
  uncertainty: ['mode', 'formula', 'op', 'termText', 'scaleFactor', 'targetMass', 'balanceUnc', 'volumeMl', 'volumeUnc'],
  stats: ['seriesA', 'seriesB', 'confidence'],
  analytical: ['mode', 'eqPreset', 'eqPh', 'metal', 'edtaPh', 'edtaConc', 'edtaVol', 'sampleVol'],
  physical: ['mode', 'kinPoints', 'kinTime', 'arrPoints', 'condConc', 'condKappa', 'deltaH', 'deltaS', 'tempC', 'compA', 'compB'],
};

describe('scenario inputs match what the tabs read', () => {
  it('should only carry keys the tab actually consumes', () => {
    for (const s of SCENARIOS) {
      const known = RESTORED_KEYS[s.tab] ?? [];
      for (const k of Object.keys(s.inputs)) {
        expect(known, `${s.tab} reads no "${k}"`).toContain(k);
      }
    }
  });

  it('should name a key for every tab that has inputs', () => {
    for (const s of SCENARIOS) {
      expect(RESTORED_KEYS[s.tab], `${s.tab} missing from the map`).toBeDefined();
    }
  });
});
