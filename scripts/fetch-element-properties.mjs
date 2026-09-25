/**
 * Regenerate src/calc/element-properties.mjs from PubChem.
 *
 * Why a generator rather than hand-entered data: 118 elements times six
 * properties is 700-odd numbers, and a typo in any one of them is invisible —
 * the table still renders, the number is just wrong. Fetching them means the
 * values are transcription-free, and re-running the script is how an update
 * gets applied.
 *
 * Source: the PubChem periodic table, run by the US National Center for
 * Biotechnology Information. PubChem data is in the public domain, which is why
 * it is used here rather than the more convenient community datasets — those
 * are typically CC BY-SA, whose ShareAlike term is incompatible with this
 * project's MIT licence. See NOTICE.md.
 *
 * The generated file is committed, so the app never needs the network. This
 * script is run by hand when the data should be refreshed:
 *
 *   node scripts/fetch-element-properties.mjs
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'calc', 'element-properties.mjs');
const ENDPOINT = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON';

/**
 * PubChem returns a column-name list plus positional rows; this turns that into
 * objects. Positional data breaks silently if the column order ever changes, so
 * the mapping is derived from the response's own Columns array rather than
 * hardcoded.
 */
function toRows(table) {
  const names = table.Columns.Column;
  return table.Row.map((r) => Object.fromEntries(names.map((c, i) => [c, r.Cell[i]])));
}

/** PubChem writes an absent value as an empty string, not as null. */
function num(v) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * "+3, +2" -> [3, 2].
 *
 * Order is preserved: PubChem lists the most common state first, and that
 * ordering is itself information a student reads.
 */
function oxidationStates(v) {
  if (!v) return [];
  return v.split(',').map((s) => Number.parseInt(s.trim(), 10)).filter(Number.isFinite);
}

/**
 * PubChem's YearDiscovered, with its known errors corrected.
 *
 * PubChem marks twelve elements "Ancient" — a string, not a year — and the
 * parser below turns any non-number into null. That is right for carbon and
 * gold, which really are prehistoric, but wrong for aluminium and calcium:
 * both are marked "Ancient" and both were isolated in the 1800s. Three more
 * years are simply off. The corrected values come from
 * src/calc/element-discovery.mjs, which is hand-curated and carries the
 * discoverer alongside the year — so the two files cannot drift apart.
 *
 * The override is applied here rather than by editing the generated file,
 * because editing it would be undone by the next run of this script.
 */
async function correctedYears() {
  const { DISCOVERY } = await import('../src/calc/element-discovery.mjs');
  return new Map(DISCOVERY.map((d) => [d.number, d.year]));
}

/** "Ancient" is PubChem's marker for a pre-record element. */
function yearDiscovered(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

const res = await fetch(ENDPOINT);
if (!res.ok) {
  console.error(`PubChem returned ${res.status} ${res.statusText}`);
  process.exit(1);
}
const rows = toRows((await res.json()).Table);
const corrected = await correctedYears();

const byNumber = new Map(rows.map((r) => [Number.parseInt(r.AtomicNumber, 10), r]));

const lines = [];
const missing = { electronegativity: [], melt: [], boil: [], density: [], year: [] };

for (let z = 1; z <= 118; z++) {
  const r = byNumber.get(z);
  if (!r) {
    console.error(`PubChem has no element ${z}`);
    process.exit(1);
  }

  const electronegativity = num(r.Electronegativity);
  const melt = num(r.MeltingPoint);
  const boil = num(r.BoilingPoint);
  const density = num(r.Density);
  const year = corrected.has(z) ? corrected.get(z) : yearDiscovered(r.YearDiscovered);
  const ionization = num(r.IonizationEnergy);
  const ox = oxidationStates(r.OxidationStates);

  // Absent values are recorded as null rather than omitted, so every element
  // has the same shape and a consumer never has to distinguish "missing" from
  // "zero". Counting them here keeps the gap visible at generation time.
  if (electronegativity === null) missing.electronegativity.push(r.Symbol);
  if (melt === null) missing.melt.push(r.Symbol);
  if (boil === null) missing.boil.push(r.Symbol);
  if (density === null) missing.density.push(r.Symbol);
  if (year === null) missing.year.push(r.Symbol);

  const f = (v) => (v === null ? 'null' : String(v));
  lines.push(
    `  { number: ${z}, electronegativity: ${f(electronegativity)}, `
    + `oxidationStates: [${ox.join(', ')}], `
    + `melt: ${f(melt)}, boil: ${f(boil)}, density: ${f(density)}, `
    + `ionization: ${f(ionization)}, yearDiscovered: ${f(year)} },`,
  );
}

const stamp = new Date().toISOString().slice(0, 10);

const header = `/**
 * Element properties — electronegativity, oxidation states, melting and boiling
 * points, density, first ionization energy, and year of discovery.
 *
 * GENERATED by scripts/fetch-element-properties.mjs from the PubChem periodic
 * table (US National Center for Biotechnology Information, public domain).
 * Do not edit by hand: re-run the script so the values stay transcription-free.
 *
 * Regenerated: ${stamp}
 *
 * Units, all as PubChem publishes them:
 *   melt, boil        kelvin
 *   density           g/cm3 (gases at STP, hence the small numbers)
 *   ionization        electron volts, first ionization energy only
 *   electronegativity Pauling scale
 *   yearDiscovered    null for the elements known since antiquity
 *
 * yearDiscovered is NOT pure PubChem: five of its values are wrong and are
 * overridden from src/calc/element-discovery.mjs, which also carries the
 * discoverer's name. Read the comment on correctedYears below.
 *
 * null means PubChem has no value — an unstable element with no measured
 * melting point, or one whose electronegativity has never been determined.
 * It is not zero, and the UI must not render it as one.
 *
 * Values are looked up by atomic number. The file is keyed that way rather than
 * by symbol because a symbol is a name and names get reused; the number is the
 * element's identity.
 */

/** @type {Array<{number:number,electronegativity:number|null,oxidationStates:number[],melt:number|null,boil:number|null,density:number|null,ionization:number|null,yearDiscovered:number|null}>} */
export const ELEMENT_PROPERTIES = [
`;

const footer = `];

/** Properties for one atomic number, or null if it is out of range. */
export function propertiesOf(atomicNumber) {
  return ELEMENT_PROPERTIES[atomicNumber - 1] ?? null;
}
`;

writeFileSync(OUT, header + lines.join('\n') + '\n' + footer, 'utf8');

console.log(`Wrote ${OUT}`);
console.log(`  ${lines.length} elements`);
for (const [field, syms] of Object.entries(missing)) {
  console.log(`  ${field}: ${syms.length} absent${syms.length ? ' — ' + syms.join(' ') : ''}`);
}
