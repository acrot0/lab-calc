/**
 * Analytical chemistry: complexometric and redox titration, gravimetry, recovery.
 *
 * ## What this adds that the existing titration module does not
 *
 * `titration.mjs` and `curve.mjs` model acid–base chemistry — a proton
 * transferring between an acid and a base. That covers a large share of bench
 * work and none of the rest. The four groups here are the other standard
 * quantitative methods, and each has a trap that a hand calculation walks into:
 *
 *   1. **Complexometric (EDTA).** The whole method depends on a conditional
 *      formation constant, which is the pH-independent constant divided by the
 *      fraction of EDTA that is actually deprotonated at the working pH. At
 *      pH 10 that fraction is near 1 and the titration is sharp; at pH 5 it is
 *      around 10⁻⁷ and the same titration does not work at all. An
 *      unconditional constant gives a confident wrong answer.
 *
 *   2. **Redox.** The equivalence-point potential is not the average of the two
 *      formal potentials — it is a weighted average that depends on the
 *      stoichiometry, and for an asymmetric reaction (2 MnO₄⁻ to 5 Fe²⁺) the
 *      weighting is the whole story.
 *
 *   3. **Gravimetry.** The gravimetric factor converts the mass of the weighed
 *      form to the mass of the sought component. Getting the stoichiometric
 *      ratio backwards is a common and silent error, so the factor is returned
 *      alongside the ratio it came from.
 *
 *   4. **Recovery and spike.** The standard way to show a method works is a
 *      spiked sample, and the useful number is not the recovery of the spike
 *      alone but whether it is statistically distinguishable from 100%.
 *
 * Pure functions, no I/O — errors are codes (see errors.mjs).
 */
import { fail, requirePositive, requireNonNegative, requireFinite } from './errors.mjs';
import { molarMass } from './solution.mjs';
import { tQuantile } from './distributions.mjs';

/**
 * Formation constants for the common EDTA complexes, as log₁₀ K.
 *
 * `logK` is the pH-independent constant for M + Y⁴⁻ ⇌ MY. The fourth
 * dissociation of EDTA has pKa 10.24, so at any pH below about 12 the
 * tetra-anion is a minority species and the effective constant is far smaller.
 * That is what `conditionalLogK` below corrects for.
 *
 * The values are the IUPAC/NIST compilation figures at 25 °C and I → 0. Real
 * work at I = 0.1 lowers each by roughly 0.1–0.3 log units; the correction is
 * not applied here because the tabulated constants are quoted for the
 * thermodynamic standard state and mixing in an activity correction would make
 * the table disagree with every printed reference.
 */
export const EDTA_FORMATION = {
  Mg: { logK: 8.79, charge: 2 },
  Ca: { logK: 10.69, charge: 2 },
  Mn: { logK: 13.87, charge: 2 },
  Fe2: { logK: 14.33, charge: 2 },
  Zn: { logK: 16.50, charge: 2 },
  Cd: { logK: 16.46, charge: 2 },
  Pb: { logK: 18.04, charge: 2 },
  Ni: { logK: 18.62, charge: 2 },
  Cu: { logK: 18.80, charge: 2 },
  Al: { logK: 16.13, charge: 3 },
  Fe3: { logK: 25.10, charge: 3 },
  Bi: { logK: 27.94, charge: 3 },
  Co3: { logK: 36.00, charge: 3 },
  Th: { logK: 23.20, charge: 4 },
};

/**
 * Cumulative protonation constants of EDTA: log β for HₙY.
 *
 * These are what turn a pH into the fraction of EDTA present as the free
 * tetra-anion. The four values are the stepwise log K values 10.24, 6.16,
 * 2.67 and 2.0 summed into cumulative form:
 *
 *   log β₁ = 10.24  (HY³⁻)
 *   log β₂ = 16.40  (H₂Y²⁻)
 *   log β₃ = 19.07  (H₃Y⁻)
 *   log β₄ = 21.07  (H₄Y)
 */
const EDTA_LOG_BETA = [10.24, 16.40, 19.07, 21.07];

/**
 * The fraction of total EDTA present as Y⁴⁻ at a given pH: α_Y⁴⁻.
 *
 *   α = 1 / (1 + Σ βᵢ[H⁺]ⁱ)
 *
 * This is the number the conditional constant divides by, and it spans an
 * enormous range — 1 at pH 12, 0.35 at pH 10, 3.5 × 10⁻⁷ at pH 5. That range is
 * why a single "EDTA works" statement is meaningless without a pH.
 */
export function edtaAlphaY({ pH }) {
  requireFinite(pH, 'pH');
  const h = 10 ** -pH;
  let sum = 1;
  // hⁱ built up across the loop. The β values are CUMULATIVE, so the term is
  // βᵢ·[H⁺]ⁱ — multiplying the β values together as well as the powers would
  // compound them into β₁β₂β₃β₄, which is off by roughly 10^45 and makes the
  // fraction collapse to zero at every pH.
  let hPow = 1;
  for (const logBeta of EDTA_LOG_BETA) {
    hPow *= h;
    sum += 10 ** logBeta * hPow;
  }
  return 1 / sum;
}

/**
 * The conditional formation constant at a working pH, as log₁₀ K′.
 *
 *   K′ = K · α_Y⁴⁻        so        log K′ = log K + log α
 *
 * This is the constant the titration actually obeys, and it is the number that
 * decides whether an endpoint will be sharp. A rule of thumb worth knowing:
 * log K′ below about 8 gives no usable break in the curve, because the
 * equivalence region is not steep enough to see.
 *
 * `sharp` reports that judgement rather than leaving the caller to apply a
 * threshold from memory, and `valid` reports whether the pH is inside the range
 * where the tabulated protonation constants are trustworthy — above pH 12 the
 * metal hydroxide starts to precipitate and the model has no term for it.
 */
export function conditionalLogK({ metal, pH }) {
  requireFinite(pH, 'pH');
  const entry = EDTA_FORMATION[metal];
  if (!entry) fail('unknownMetal', { metal });
  const alpha = edtaAlphaY({ pH });
  const logAlpha = Math.log10(alpha);
  const conditionalLogK = entry.logK + logAlpha;
  return {
    metal,
    pH,
    logK: entry.logK,
    alpha,
    conditionalLogK,
    // Below this the equivalence break is too shallow to titrate against.
    sharp: conditionalLogK >= 8,
    // Above pH 12 most metals hydrolyse and precipitate; the model has no term
    // for that, so the answer is an extrapolation and says so.
    valid: pH <= 12,
  };
}

/**
 * Complexometric titration of a metal with EDTA.
 *
 *   mol M = C_EDTA · V_EDTA      at the equivalence point, 1:1
 *
 * The 1:1 stoichiometry holds for every metal in the table above — EDTA has six
 * donor atoms and wraps the ion regardless of its charge, which is the property
 * that makes one reagent work for so many analytes.
 */
export function edtaTitration({
  titrantConc, titrantVolumeMl, sampleVolumeMl, metal,
}) {
  requirePositive(titrantConc, 'titrantConc');
  requirePositive(titrantVolumeMl, 'titrantVolumeMl');
  requirePositive(sampleVolumeMl, 'sampleVolumeMl');

  const moles = titrantConc * (titrantVolumeMl / 1000);
  const conc = moles / (sampleVolumeMl / 1000);
  const result = {
    molesMetal: moles,
    sampleConc: conc,
    sampleMm: conc * 1000,
    stoichiometry: 1,
  };
  if (metal) {
    // Mass concentration needs the atomic mass, which the formula parser
    // already knows: the element symbol is a valid formula.
    result.massConcGPerL = conc * molarMass(metal);
  }
  return result;
}

/**
 * Masking-agent check: whether a interferent can be hidden.
 *
 * A masking agent binds an interferent more strongly than EDTA does, so the
 * interferent is unavailable for titration. Whether it works is a competition
 * between two conditional constants, and the rule of thumb is that masking is
 * effective when the maskant's conditional constant exceeds EDTA's by two
 * orders of magnitude or more — otherwise the interferent is only partly
 * hidden and the endpoint drifts.
 *
 * Returned as a comparison rather than a verdict, because "effective" depends
 * on how much accuracy the analysis needs.
 */
export function maskingMargin({ maskantLogK, interferentLogK }) {
  requireFinite(maskantLogK, 'maskantLogK');
  requireFinite(interferentLogK, 'interferentLogK');
  const margin = maskantLogK - interferentLogK;
  return {
    margin,
    effective: margin >= 2,
    // Between 0 and 2 the interferent is partly masked: some is hidden and some
    // is titrated, which biases the result low without any visible symptom.
    partial: margin > 0 && margin < 2,
  };
}

/**
 * Equivalence-point potential of a redox titration.
 *
 * ## Why this is not the average of the two formal potentials
 *
 * For a symmetric reaction (1:1, equal electron counts) the equivalence
 * potential really is the mean. For an asymmetric one it is a weighted mean,
 * and the weights come from the stoichiometry:
 *
 *   n₁·Ox₁ + n₂·Red₂ ⇌ n₁·Red₁ + n₂·Ox₂
 *
 *   E_eq = (n₁·E°₁ + n₂·E°₂) / (n₁ + n₂)
 *
 * where n₁ and n₂ are the number of electrons in each half-reaction. For the
 * permanganate–iron titration (n₁ = 5, n₂ = 1) that puts the equivalence
 * potential 5/6 of the way toward the permanganate couple, at about 1.39 V
 * rather than the 1.24 V a plain average gives. A 150 mV error moves the
 * endpoint through a visible region of the curve.
 *
 * ## The caveat the formula carries
 *
 * This expression is exact only when both half-reactions have equal numbers of
 * oxidized and reduced species on each side — the "symmetric" case. When they
 * do not (MnO₄⁻ → Mn²⁺ has one species on the left and one on the right, so it
 * is symmetric; Cr₂O₇²⁻ → 2 Cr³⁺ is not) the true equivalence potential also
 * depends on concentration. `exact` reports which case applies.
 */
export function redoxEquivalence({ halfCell1, halfCell2 }) {
  const { potential: e1, electrons: n1, symmetric: s1 = true, label: l1 } = halfCell1 ?? {};
  const { potential: e2, electrons: n2, symmetric: s2 = true, label: l2 } = halfCell2 ?? {};
  requireFinite(e1, 'potential1');
  requireFinite(e2, 'potential2');
  if (!Number.isInteger(n1) || n1 <= 0) fail('mustBePositive', { name: 'electrons1', value: n1 });
  if (!Number.isInteger(n2) || n2 <= 0) fail('mustBePositive', { name: 'electrons2', value: n2 });

  const potential = (n1 * e1 + n2 * e2) / (n1 + n2);
  const symmetric = s1 && s2;
  return {
    potential,
    electrons1: n1,
    electrons2: n2,
    label1: l1,
    label2: l2,
    // The unweighted mean, returned so the UI can show what the shortcut would
    // have given and how far off it is.
    naiveMean: (e1 + e2) / 2,
    symmetric,
  };
}

/**
 * Cell potential at a point in a redox titration, from the Nernst equation.
 *
 *   E = E° − (0.05916/n)·log₁₀([Red]/[Ox])
 *
 * Before the equivalence point the analyte's ratio is known exactly from how
 * much titrant has been added, so the potential is computed from the analyte
 * couple. After it, the titrant's ratio is known instead. At the equivalence
 * point neither ratio is determined and the weighted form above applies.
 *
 * Choosing the wrong couple for the region is the standard error: using the
 * titrant couple before the equivalence point divides by a concentration that
 * is nearly zero, and the potential runs off to infinity.
 */
export function redoxPoint({ fraction, equivalencePotential, halfCell }) {
  requireFinite(fraction, 'fraction');
  requireFinite(equivalencePotential, 'equivalencePotential');
  const { potential: e0, electrons: n } = halfCell ?? {};
  requireFinite(e0, 'potential');
  if (!Number.isInteger(n) || n <= 0) fail('mustBePositive', { name: 'electrons', value: n });
  if (fraction <= 0) fail('mustBePositive', { name: 'fraction', value: fraction });

  // 0.05916 V is the Nernst slope RT/F·ln10 at 298.15 K.
  const slope = 0.05916 / n;
  if (Math.abs(fraction - 1) < 1e-9) {
    return { potential: equivalencePotential, region: 'equivalence', slope };
  }
  if (fraction < 1) {
    // Analyte region: the ratio of oxidized to reduced analyte is (1 − f)/f.
    return { potential: e0 - slope * Math.log10((1 - fraction) / fraction), region: 'analyte', slope };
  }
  // Titrant region: the excess titrant sets the ratio, (f − 1).
  return { potential: e0 - slope * Math.log10(1 / (fraction - 1)), region: 'titrant', slope };
}

/**
 * Gravimetric factor: the mass of sought component per mass of weighed form.
 *
 *   F = (a · M_sought) / (b · M_weighed)
 *
 * where a and b are the stoichiometric coefficients that balance the sought
 * element across the two formulas. For determining iron by weighing Fe₂O₃:
 *
 *   F = (2 · M_Fe) / (1 · M_Fe₂O₃) = 111.69 / 159.69 = 0.6994
 *
 * Reversing the ratio gives 1.4297, which is wrong by a factor of two and looks
 * entirely plausible on a report. Returning `ratio` and both molar masses
 * alongside the factor is what makes the direction checkable.
 */
export function gravimetricFactor({ sought, weighed, soughtCount = 1, weighedCount = 1 }) {
  requirePositive(soughtCount, 'soughtCount');
  requirePositive(weighedCount, 'weighedCount');
  const mSought = molarMass(sought);
  const mWeighed = molarMass(weighed);
  const factor = (soughtCount * mSought) / (weighedCount * mWeighed);
  return {
    factor,
    molarMassSought: mSought,
    molarMassWeighed: mWeighed,
    ratio: `${soughtCount} ${sought} : ${weighedCount} ${weighed}`,
  };
}

/**
 * Percent analyte from a gravimetric determination.
 *
 *   % = (m_precipitate · F / m_sample) · 100
 *
 * The ignition or drying step is why the weighed form is usually not the sought
 * form: iron is precipitated as the hydroxide, ignited to Fe₂O₃, and weighed as
 * that. The factor carries the conversion.
 */
export function gravimetricPercent({
  sampleMassG, precipitateMassG, factor,
}) {
  requirePositive(sampleMassG, 'sampleMass');
  requireNonNegative(precipitateMassG, 'precipitateMass');
  requirePositive(factor, 'factor');
  const analyteMassG = precipitateMassG * factor;
  return {
    analyteMassG,
    percent: (analyteMassG / sampleMassG) * 100,
  };
}

/**
 * Recovery of a spiked analyte.
 *
 *   recovery % = (amount found in the spike) / (amount added) · 100
 *
 * The spike's contribution is the difference between the spiked and unspiked
 * measurements, so both must be given. This is the standard way to show a
 * method is accurate on a real matrix, and it is where a method that looks fine
 * on standards fails.
 */
export function spikeRecovery({ unspiked, spiked, added }) {
  requireFinite(unspiked, 'unspiked');
  requireFinite(spiked, 'spiked');
  requirePositive(added, 'added');
  const found = spiked - unspiked;
  const recovery = (found / added) * 100;
  return {
    found,
    added,
    recovery,
    /*
     * The accepted window for a trace method. Outside 80–120% the method has a
     * problem worth investigating before any result from it is reported — and
     * for a major component the window is tighter still, which is why this is
     * reported as a band rather than a pass/fail.
     */
    acceptable: recovery >= 80 && recovery <= 120,
    direction: recovery > 100 ? 'high' : recovery < 100 ? 'low' : 'exact',
  };
}

/**
 * Whether a recovery differs from 100% by more than the measurement's own noise.
 *
 * A recovery of 95% sounds like a bias and may be nothing but scatter: if the
 * standard deviation of the measurement is 5%, then 95% is one sigma away and
 * there is no evidence of anything. The alternative reading — treating any
 * departure from 100% as a bias — invents problems and sends people hunting for
 * a systematic error that is not there.
 *
 * Uses the t statistic against a hypothesised value of 100%, with the standard
 * deviation estimated from the replicates.
 */
export function recoveryBias({ recoveries, confidence = 0.95 }) {
  if (!Array.isArray(recoveries) || recoveries.length < 2) {
    fail('statsTooFewForCI', { n: Array.isArray(recoveries) ? recoveries.length : 0, min: 2 });
  }
  for (const r of recoveries) requireFinite(r, 'recovery');

  const n = recoveries.length;
  const mean = recoveries.reduce((a, b) => a + b, 0) / n;
  const ss = recoveries.reduce((acc, r) => acc + (r - mean) ** 2, 0);
  const sd = Math.sqrt(ss / (n - 1));
  const sem = sd / Math.sqrt(n);

  if (sem === 0) {
    // Every replicate identical: either exactly 100% or a definite bias, with
    // no sampling error to test against.
    return {
      mean, sd, n, t: null, significant: mean !== 100, biased: mean !== 100,
      note: 'identical',
    };
  }

  const t = (mean - 100) / sem;
  // Two-sided t at the given confidence. The 1.96 shortcut is wrong at the
  // replicate counts a recovery study actually uses.
  const critical = tQuantile(1 - (1 - confidence) / 2, n - 1);
  return {
    mean,
    sd,
    sem,
    n,
    t,
    critical,
    confidence,
    significant: Math.abs(t) > critical,
    // A statistically significant bias is not the same as a large one: at
    // enough replicates a 0.1% offset becomes significant. Both are returned.
    biased: Math.abs(t) > critical,
    percentBias: mean - 100,
  };
}
