#!/usr/bin/env node
/**
 * Smoke test the built bundle without a browser.
 *
 * Why this exists: `npm run build` succeeding only proves the bundler ran. It
 * does not prove the app works — a missing import builds fine and then throws
 * "X is not defined" at runtime, blanking the page. That happened here.
 *
 * This imports the calc modules the UI is built on and asserts known answers.
 * It is not a substitute for the browser checks done by hand; it is the part
 * that can run in CI on every push.
 */
import {
  molarMass, massForMolarity, dilution, stockFromSolid,
} from '../src/calc/solution.mjs';
import {
  bufferRecipe, dilutionSeries, hendersonHasselbalch,
} from '../src/calc/buffer.mjs';
import { convert } from '../src/calc/units.mjs';
import { evaluate } from '../src/calc/expression.mjs';
import {
  weakAcidPh, weakBasePh, equivalenceVolume, percentToMolarity, preparePercentSolution,
} from '../src/calc/titration.mjs';

const cases = [
  ['molarMass NaCl', molarMass('NaCl'), 58.44, 1],
  ['molarMass CuSO4·5H2O', molarMass('CuSO4·5H2O'), 249.68, 1],
  ['massForMolarity 0.5M/500mL NaCl', massForMolarity({ formula: 'NaCl', molarity: 0.5, volumeMl: 500 }).massG, 14.61, 1],
  ['stockFromSolid', stockFromSolid({ formula: 'NaOH', molarity: 1, volumeMl: 1000 }).massG, 39.997, 2],
  ['dilution stock mL', dilution({ stockConc: 1, targetConc: 0.1, targetVolumeMl: 100 }).stockVolumeMl, 10, 6],
  ['dilution diluent mL', dilution({ stockConc: 1, targetConc: 0.1, targetVolumeMl: 100 }).diluentVolumeMl, 90, 6],
  ['hendersonHasselbalch midpoint', hendersonHasselbalch({ pKa: 4.76, acidConc: 0.1, baseConc: 0.1 }), 4.76, 6],
  ['bufferRecipe ratio', bufferRecipe({ pKa: 4.76, targetPh: 5.76 }).ratio, 10, 4],
  ['dilutionSeries step1', dilutionSeries({ stockConc: 1000, factor: 10, steps: 3 })[0].conc, 100, 6],
  ['convert g→mg', convert(1, 'g', 'mg'), 1000, 6],
  ['convert lb→g', convert(1, 'lb', 'g'), 453.59237, 5],
  ['convert 0°C→K', convert(0, 'C', 'K'), 273.15, 6],
  // The calculator's headline case, and the one a wrong unit table gets wrong.
  ['evaluate 5 g / 250 mL', evaluate('5 g / 250 mL').value, 20, 6],
  ['evaluate 1 mV / 1 mA', evaluate('1 mV / 1 mA').value, 1, 6],
  ['evaluate 1 atm * 1 L', evaluate('1 atm * 1 L').value, 101.325, 3],
  ['weakAcidPh 0.1M acetic', weakAcidPh({ pKa: 4.76, conc: 0.1 }), 2.88, 1],
  ['weakBasePh 0.1M ammonia', weakBasePh({ pKb: 4.75, conc: 0.1 }), 11.13, 1],
  ['equivalenceVolume', equivalenceVolume({ analyteConc: 0.1, analyteVolumeMl: 25, titrantConc: 0.1 }).titrantVolumeMl, 25, 6],
  ['percentToMolarity 0.9% NaCl', percentToMolarity({ percent: 0.9, formula: 'NaCl' }), 0.154, 2],
  ['preparePercentSolution 10%/250mL', preparePercentSolution({ percent: 10, volumeMl: 250 }).massG, 25, 6],
];

let failed = 0;
for (const [name, actual, expected, digits] of cases) {
  const ok = Math.abs(actual - expected) < 0.5 * 10 ** -digits;
  if (!ok) {
    console.error(`  FAIL ${name}: got ${actual}, expected ~${expected}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n  ${failed} smoke check(s) failed`);
  process.exit(1);
}
console.log(`  OK: ${cases.length} calculations produce known answers`);
