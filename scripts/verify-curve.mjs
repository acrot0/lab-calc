#!/usr/bin/env node
/**
 * Print titration curves with their landmark values so the chemistry can be
 * eyeballed against a textbook. Run manually; not part of CI.
 *
 *   node scripts/verify-curve.mjs
 */
import { titrationCurve, findEquivalencePoint, equivalenceVolumes } from '../src/calc/curve.mjs';

const fmt = (v, d = 2) => v.toFixed(d);

function landmarks(label, spec, halfEqVolumes) {
  const vols = equivalenceVolumes(spec);
  console.log(`\n${label}`);
  console.log(`  等当点: ${vols.map((v) => fmt(v) + ' mL').join('  ')}`);
  const first = findEquivalencePoint(spec);
  console.log(`  第一个等当点 pH: ${fmt(first.ph)}`);
  const pts = titrationCurve({ ...spec, points: 900 });
  const at = (v) => pts.reduce((b, p) => (Math.abs(p.volumeMl - v) < Math.abs(b.volumeMl - v) ? p : b));
  for (const [v, note] of halfEqVolumes) {
    console.log(`  ${fmt(v, 1).padStart(5)} mL (${note}): pH ${fmt(at(v).ph)}`);
  }
}

landmarks('弱酸（乙酸 pKa 4.76）', { pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.1 },
  [[12.5, '半等当点，应为 pKa']]);

landmarks('强酸（HCl）', { strongAcid: true, conc: 0.1, volumeMl: 25, titrantConc: 0.1 },
  [[12.5, '半等当点'], [25, '等当点，应为 7']]);

landmarks('三元酸（磷酸 pKa 2.15/7.20/12.35）',
  { pKas: [2.15, 7.20, 12.35], conc: 0.1, volumeMl: 25, titrantConc: 0.1 },
  [[12.5, '应为 pKa1=2.15'], [37.5, '应为 pKa2=7.20'], [62.5, '应为 pKa3=12.35']]);
console.log('');
