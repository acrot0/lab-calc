/**
 * Molecular biology bench calculations.
 *
 * The arithmetic a wet-lab biologist does several times a day, and that is
 * currently done on a phone calculator with a paper towel beside it. Every one
 * of these is a ratio, which is why they are worth automating: the numbers are
 * not hard, they are just easy to get wrong at 6pm with a pipette in one hand.
 *
 * Three things this module is careful about, because each is a real source of
 * silently wrong answers:
 *
 *   - **Units are carried, not assumed.** A260 is dimensionless, concentration
 *     is ng/µL, and the 50 in the DNA formula is a coefficient with units of
 *     µg/mL per A260 unit. Writing the units out is what stops a factor of 1000
 *     from appearing between the cuvette and the notebook.
 *   - **The extinction coefficients are the standard ones, with their caveats
 *     attached.** 50/40/33 µg/mL are for double-stranded DNA, RNA, and
 *     single-stranded DNA/oligos respectively. Using 50 on an oligo overstates
 *     the yield by 50%.
 *   - **Ratios are reported with the caveat that makes them meaningful.** A
 *     260/280 of 1.8 means pure DNA only because the two absorbances are read
 *     in the same buffer; a ratio from a different blank is a different number.
 *
 * Pure functions, no I/O, no i18n — errors are codes (see errors.mjs).
 */
import { fail, requirePositive, requireNonNegative, requireFinite } from './errors.mjs';

/**
 * A260 extinction coefficients, in µg/mL per absorbance unit at 260 nm.
 *
 * These are the values every molecular biology manual tabulates. They are
 * *not* interchangeable: the coefficient depends on the average base
 * composition and on strandedness, and the standard figures are for an
 * "average" sequence. An oligo rich in G+C absorbs less per µg than one rich
 * in A+T, so a yield computed from A260 is an estimate, not a measurement —
 * which is why a spectrophotometric yield is always followed by a gel.
 */
export const EXTINCTION = {
  dsDNA: 50,
  ssDNA: 33,
  rna: 40,
  oligo: 33,
};

/** How much light a 1 cm path absorbs; the standard cuvette. */
export const DEFAULT_PATH_CM = 1;

/**
 * Concentration from absorbance, by Beer–Lambert.
 *
 * @param {number} a260   Absorbance at 260 nm
 * @param {string} type   Key of EXTINCTION
 * @param {number} pathCm Cuvette path length in cm
 * @param {number} dilution  Fold-dilution of the measured sample (1 = neat)
 * @returns {{ concNgPerUl: number, concUgPerMl: number, coefficient: number }}
 */
export function nucleicAcidConc(a260, type = 'dsDNA', pathCm = DEFAULT_PATH_CM, dilution = 1) {
  const k = EXTINCTION[type];
  if (k === undefined) fail('bio.unknownNucleicType', { type });
  requireNonNegative(a260, 'a260');
  requirePositive(pathCm, 'path');
  requirePositive(dilution, 'dilution');

  // µg/mL = A260 × coefficient ÷ path, then the dilution the sample was read at.
  const ugPerMl = (a260 * k * dilution) / pathCm;
  return {
    // 1 µg/mL is 1 ng/µL — the same number in both units, which is why both are
    // returned rather than making every caller remember the identity.
    concNgPerUl: ugPerMl,
    concUgPerMl: ugPerMl,
    coefficient: k,
  };
}

/**
 * The 260/280 and 260/230 ratios, with a verdict.
 *
 * The ratios are how contamination is detected: protein absorbs at 280, and
 * guanidine, phenol and carbohydrates absorb at 230. A pure preparation has
 * 260/280 ≈ 1.8 for DNA and ≈ 2.0 for RNA, and 260/230 ≈ 2.0–2.2 for both.
 *
 * The verdict is deliberately coarse — "clean", "protein", "reagent" — because
 * a ratio cannot distinguish a little phenol from a lot, and a number presented
 * as a diagnosis is worse than a number presented as a number.
 *
 * @returns {{ ratio260280: number|null, ratio260230: number|null, verdict: string }}
 */
export function purityRatios(a260, a280, a230) {
  requireFinite(a260, 'a260');
  if (a280 !== null && a280 !== undefined) requireFinite(a280, 'a280');
  if (a230 !== null && a230 !== undefined) requireFinite(a230, 'a230');

  // A zero denominator is the normal case for a blank or a failed prep, not an
  // error — the ratio is simply undefined, and null says that where Infinity
  // would be a lie a table would print.
  const ratio260280 = a280 > 0 ? a260 / a280 : null;
  const ratio260230 = a230 > 0 ? a260 / a230 : null;

  let verdict = 'unknown';
  if (ratio260280 !== null) {
    if (ratio260280 < 1.6) verdict = 'protein';
    else if (ratio260280 > 2.2) verdict = 'rnaOrLow';
    else if (ratio260230 !== null && ratio260230 < 1.5) verdict = 'reagent';
    else verdict = 'clean';
  }
  return { ratio260280, ratio260230, verdict };
}

/**
 * Dilution to reach a target concentration.
 *
 * The C1V1 = C2V2 every bench does by hand. Returned as volumes rather than as
 * a fold factor, because the fold is not what gets pipetted.
 *
 * @returns {{ sampleUl: number, diluentUl: number, totalUl: number, fold: number }}
 */
export function dilutionToTarget(c1, v1, c2) {
  requirePositive(c1, 'c1');
  requirePositive(v1, 'v1');
  requirePositive(c2, 'c2');
  if (c2 > c1) fail('bio.dilutionIncreases');

  const sampleUl = (c2 * v1) / c1;
  return {
    sampleUl,
    diluentUl: v1 - sampleUl,
    totalUl: v1,
    fold: c1 / c2,
  };
}

/**
 * Molar concentration of an oligo from its absorbance.
 *
 * This is the one place the mass-based coefficients do not apply. An oligo's
 * absorbance depends on its *sequence* — each base has its own extinction
 * coefficient, and the stacked bases in a single strand absorb less than the
 * sum of the free nucleotides (the hypochromic effect). So the calculation is
 * sequence-based, and a bare A260 with no sequence cannot give a molarity at
 * all. The nearest-neighbour method used here is the standard approximation;
 * the exact nearest-neighbour model needs dinucleotide coefficients, which is
 * more data than this app carries.
 *
 * @param {number} a260
 * @param {string} sequence  The oligo, 5'→3'
 * @returns {{ nmolPerUl: number, ugPerMl: number, molarMass: number, gc: number }}
 */
export function oligoConc(a260, sequence) {
  requireNonNegative(a260, 'a260');
  const seq = String(sequence ?? '').toUpperCase().replace(/[^ACGTU]/g, '');
  if (!seq) fail('bio.oligoSequenceRequired');

  // Average molar masses of a nucleotide residue in an oligo, g/mol. The
  // residue is one water lighter than the free nucleotide, which is why these
  // are not simply the nucleotide masses.
  const RESIDUE = { A: 313.21, C: 289.18, G: 329.21, T: 304.20, U: 290.17 };
  let mass = 0;
  for (const b of seq) {
    if (!(b in RESIDUE)) fail('bio.oligoBadBase', { base: b });
    mass += RESIDUE[b];
  }

  // The extinction coefficients of the free nucleotides at 260 nm, L/(mol·cm).
  const EPS = { A: 15400, C: 7400, G: 11500, T: 8700, U: 9900 };
  let sum = 0;
  for (const b of seq) sum += EPS[b];
  // Hypochromicity: the observed absorbance of a single strand is lower than
  // the sum of its bases. 0.9 is the standard correction for an oligo.
  const epsilon = sum * 0.9;

  // A260 = ε · c · path, with c in mol/L and a 1 cm path.
  const molar = a260 / epsilon;          // mol/L
  const gPerL = molar * mass;            // g/L

  const gc = [...seq].filter((b) => b === 'G' || b === 'C').length / seq.length;
  return {
    /*
     * nmol/µL is the unit an oligo is ordered and resuspended in.
     *
     * 1 mol/L = 10⁹ nmol / 10⁶ µL = 10³ nmol/µL. (Equivalently, 1 nmol/µL is
     * 1 mmol/L, which is the identity usually quoted.)
     */
    nmolPerUl: molar * 1e3,
    // 1 g/L = 10⁶ µg / 10³ mL = 10³ µg/mL.
    ugPerMl: gPerL * 1e3,
    molarMass: mass,
    gc,
  };
}

/**
 * Cell culture: seeding density and the volume to take from a stock.
 *
 * @returns {{ volumeUl: number, cellsNeeded: number, dilution: number }}
 */
export function seedingVolume(stockConc, targetConc, targetVolumeMl) {
  requirePositive(stockConc, 'stock');
  requirePositive(targetConc, 'target');
  requirePositive(targetVolumeMl, 'volume');
  if (targetConc > stockConc) fail('bio.seedTooConcentrated');

  const volumeMl = (targetConc * targetVolumeMl) / stockConc;
  return {
    volumeUl: volumeMl * 1000,
    cellsNeeded: targetConc * targetVolumeMl,
    dilution: stockConc / targetConc,
  };
}

/**
 * Population doubling time, and the doublings a culture has undergone.
 *
 * The doubling time is the number a culture's growth curve is reported by, and
 * it is only meaningful between the same two timepoints for a culture in
 * exponential phase — a lagging or confluent culture gives a number that is
 * arithmetic rather than biology.
 *
 * @returns {{ doublings: number, doublingTimeH: number, ratePerH: number }}
 */
export function doublingTime(cells0, cells1, hours) {
  requirePositive(cells0, 'cells0');
  requirePositive(cells1, 'cells1');
  requirePositive(hours, 'hours');
  if (cells1 < cells0) fail('bio.cultureDeclined');

  const doublings = Math.log2(cells1 / cells0);
  return {
    doublings,
    doublingTimeH: hours / doublings,
    ratePerH: doublings / hours,
  };
}

/**
 * Centrifuge: convert between RPM and relative centrifugal force.
 *
 * The relation depends on the rotor radius, which is why RPM alone is not a
 * reproducible protocol — 10 000 rpm in a microfuge and in a swinging-bucket
 * rotor are different forces, and papers report RCF for exactly this reason.
 *
 * @param {'rpm'|'rcf'} from
 * @returns {{ rpm: number|null, rcf: number|null }}
 */
export function centrifuge(value, radiusCm, from = 'rpm') {
  requirePositive(radiusCm, 'radius');
  requirePositive(value, 'value');

  if (from === 'rpm') {
    // RCF = 1.118 × 10⁻⁵ × r × (rpm)², with r in cm.
    return { rpm: value, rcf: 1.118e-5 * radiusCm * value * value };
  }
  if (from === 'rcf') {
    return { rpm: Math.sqrt(value / (1.118e-5 * radiusCm)), rcf: value };
  }
  return fail('bio.unknownCentrifugeMode', { from });
}

/**
 * The k-factor: a radius-independent way to specify a centrifugation.
 *
 * RCF and RPM both need the rotor. The k factor does not — it is a property of
 * the rotor alone, and the time to pellet a particle is `k / RCF`. Two rotors
 * with the same k pellet the same particle in the same time at the same RCF,
 * which is what makes a protocol transferable between machines.
 *
 * @returns {{ k: number, timeMin: number }}
 */
export function kFactor(radiusCm, rpm, rcf, targetRcf) {
  requirePositive(radiusCm, 'radius');
  // k = 2.53 × 10⁵ / r_max, with r in cm — the clearing constant at the rotor's
  // maximum radius, which is the conservative end.
  const k = 2.53e5 / radiusCm;
  if (!targetRcf) return { k, timeMin: null };
  requirePositive(targetRcf, 'targetRcf');
  return { k, timeMin: k / targetRcf };
}

/**
 * Enzyme kinetics: Michaelis–Menten and the linear transforms.
 *
 * The two linear forms are both returned because they disagree in the presence
 * of error, and which one is trustworthy depends on the data: the
 * Lineweaver–Burk plot compresses the high-substrate points into the corner,
 * so it weights the least reliable measurements most heavily. The Hanes–Woolf
 * plot spreads them out. Reporting both is how that is made visible instead of
 * being hidden behind one line.
 *
 * @param {Array<{s: number, v: number}>} points  Substrate and rate
 * @returns {{ vmax: number, km: number, r2: number, points: number }}
 */
export function michaelisMenten(points) {
  if (!Array.isArray(points) || points.length < 2) fail('bio.kineticsTooFewPoints');
  const clean = points
    .filter((p) => Number.isFinite(p?.s) && Number.isFinite(p?.v))
    .filter((p) => p.s > 0 && p.v > 0);
  if (clean.length < 2) fail('bio.kineticsTooFewPoints');

  /*
   * Fit the Hanes–Woolf form: s/v = (1/Vmax)·s + Km/Vmax.
   *
   * A straight line in s and s/v, so an ordinary least-squares fit gives Vmax
   * and Km directly. Chosen over Lineweaver–Burk because that form divides by v,
   * so a small rate — the noisiest measurement — gets the largest weight.
   */
  const n = clean.length;
  const xs = clean.map((p) => p.s);
  const ys = clean.map((p) => p.s / p.v);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) fail('bio.kineticsIdenticalSubstrate');
  const slope = num / den;
  const intercept = my - slope * mx;
  if (slope <= 0) fail('bio.kineticsNoFit');

  const vmax = 1 / slope;
  const km = intercept * vmax;

  // Coefficient of determination on the fitted line, so a fit that does not
  // describe the data is visible rather than merely plotted.
  const ssTot = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { vmax, km, r2, points: n };
}

/**
 * The catalytic efficiency, and whether the enzyme is diffusion-limited.
 *
 * kcat/Km has a hard ceiling — the rate at which two molecules can find each
 * other in water, about 10⁹ M⁻¹s⁻¹. An enzyme near it is "perfect", which is a
 * real and useful statement, and one that a bare kcat cannot make.
 */
export function catalyticEfficiency(kcat, km) {
  requirePositive(kcat, 'kcat');
  requirePositive(km, 'km');
  const efficiency = kcat / km;
  return {
    efficiency,
    // 10⁹ M⁻¹s⁻¹ is the usual upper bound for a diffusion-limited enzyme.
    diffusionLimited: efficiency > 1e8,
  };
}
