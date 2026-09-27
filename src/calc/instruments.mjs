/**
 * What the glassware and the balance are worth.
 *
 * ## Why this exists
 *
 * `uncertainty.mjs` knows how to propagate an uncertainty but not what any
 * input's uncertainty *is*. That left the engine complete and unused: every
 * result still quoted four or five digits, and a four-place balance cannot
 * support four digits on a 0.5 g sample.
 *
 * The missing piece is a tolerance table. A class A 100 mL flask is certified
 * to ±0.10 mL — that is a guarantee about the outside of the interval and says
 * nothing about where inside it the true value sits. That is precisely a
 * rectangular distribution, so the standard uncertainty is a/√3 (GUM 4.3.7,
 * Eurachem QUAM:2012 §8.1.4). Not a convention chosen here: the conversion is
 * the same one a metrologist does by hand.
 *
 * ## What is deliberately not modelled
 *
 * **Operator technique.** Filling to the mark, reading the meniscus, draining
 * time, temperature equilibrium — a careful worker and a careless one differ by
 * more than the glassware tolerance, and none of it is in any table. A result
 * from this module is the uncertainty of the *glassware*, and a real
 * uncertainty budget has to add the human terms separately. The module returns
 * its components by name so a caller can see exactly what is and is not in the
 * number.
 *
 * **Systematic error.** A flask that is out of tolerance in one direction, a
 * balance reading consistently high. The tolerance interval already covers the
 * worst case, but a *bias* does not average out and cannot be found by
 * arithmetic — only by calibration.
 *
 * **Sample purity and hygroscopicity.** Weighing 0.5 g of NaOH pellets gives a
 * mass, not 0.5 g of NaOH. That error is usually larger than everything here,
 * and no tolerance table can see it.
 *
 * Pure functions, no I/O — errors are codes (see errors.mjs).
 */
import { fail, requireFinite, requirePositive, requireNonNegative } from './errors.mjs';
import { sumUncertainty } from './uncertainty.mjs';

/**
 * Class A volumetric flask tolerances, in mL, by nominal volume (ISO 1042 /
 * ASTM E288).
 *
 * These are the published limits. The table is written out rather than
 * computed: the values are not a smooth function of volume — a 10 mL flask and
 * a 25 mL flask are both ±0.02 mL — so a formula would be a curve fitted
 * through a standard, and the standard is what a certificate cites.
 */
export const FLASK_TOLERANCE_ML = {
  5: 0.02, 10: 0.02, 25: 0.03, 50: 0.05, 100: 0.10,
  250: 0.15, 500: 0.25, 1000: 0.40, 2000: 0.60,
};

/**
 * Class A one-mark transfer pipette tolerances, in mL (ISO 648 / ASTM E969).
 *
 * Smaller than a flask of the same volume at the low end and larger at the high
 * end: a 25 mL pipette is ±0.03 mL against a 25 mL flask's ±0.03 mL, but the
 * pipette carries the additional drainage-time term the flask does not have.
 */
export const PIPETTE_TOLERANCE_ML = {
  1: 0.007, 2: 0.010, 5: 0.015, 10: 0.020,
  20: 0.030, 25: 0.030, 50: 0.050, 100: 0.080,
};

/**
 * Class A burette tolerances, in mL, by nominal capacity.
 *
 * A burette is read twice per titre — start and end — and its tolerance applies
 * to each reading rather than to the delivered volume, so a caller using one
 * has to count the term twice. That is the same trap as the balance linearity
 * below, and the reason `components` names the term rather than folding it in.
 */
export const BURETTE_TOLERANCE_ML = {
  10: 0.02, 25: 0.03, 50: 0.05, 100: 0.10,
};

/** The tables, keyed by the name a caller uses. */
const TABLES = {
  flask: FLASK_TOLERANCE_ML,
  pipette: PIPETTE_TOLERANCE_ML,
  burette: BURETTE_TOLERANCE_ML,
};

/** The instrument names `instrumentUncertainty` accepts. */
export const INSTRUMENT_KINDS = ['flask', 'pipette', 'burette'];

/**
 * Volumetric expansion of water minus that of borosilicate glass, per kelvin.
 *
 * 2.1e-4 is water's coefficient; the glass expands too, so the relevant
 * quantity is the difference and the glass term (≈1e-5) is small but not
 * nothing. Using water's figure alone would overstate the temperature term by
 * about 5%.
 */
const WATER_MINUS_GLASS_EXPANSION = 2.1e-4;

/** The temperature the glassware is calibrated at. */
const REFERENCE_TEMPERATURE_C = 20;

/**
 * Convert a tolerance half-width to a standard uncertainty.
 *
 * A tolerance says the true value is inside ±a and nothing more, which is a
 * rectangular distribution — so u = a/√3. Using `a` directly (treating it as a
 * standard deviation) overstates by 73%; using a/2 (treating it as a 95%
 * interval) overstates by 41%. Both are common and both make a result look
 * worse than it is, which hides the real limiting factor.
 */
export function rectangularStandardUncertainty(halfWidth) {
  requireNonNegative(halfWidth, 'halfWidth');
  return halfWidth / Math.sqrt(3);
}

/**
 * The tolerance for a nominal size, from the standard's table.
 *
 * An unlisted capacity takes the tolerance of the **next smaller** listed size.
 * That is ASTM E288 §1.1.3 and E969 §1.2, and it is the conservative direction:
 * a 300 mL flask is only class A if it meets the 250 mL tolerance. Rounding up
 * to the next larger size instead would claim a guarantee the standard does not
 * make.
 *
 * Below the smallest listed size there is no answer to give. Extrapolating
 * downwards would invent a tolerance tighter than any real product, which
 * understates the uncertainty — the direction that gets an experiment approved
 * on numbers that do not hold.
 */
export function toleranceFor(kind, nominalMl) {
  const table = TABLES[kind];
  if (!table) fail('unknownInstrument', { kind });
  requirePositive(nominalMl, 'nominalMl');
  const sizes = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (nominalMl < sizes[0]) fail('noToleranceForSize', { kind, nominalMl, smallest: sizes[0] });
  let chosen = sizes[0];
  for (const size of sizes) {
    if (size <= nominalMl) chosen = size;
  }
  return table[chosen];
}

/**
 * The uncertainty on a volume measured with a piece of volumetric glassware.
 *
 * Two components:
 *
 *   - **tolerance** — the certification limit, a/√3, doubled for class B.
 *   - **temperature** — only when the working temperature differs from 20 °C.
 *     Glassware is calibrated to contain its nominal volume at 20 °C; used warm,
 *     the liquid expands more than the glass, so the delivered volume is larger
 *     than the mark. The effect is 0.021% per kelvin, which is small next to a
 *     class A tolerance and dominant next to nothing — worth carrying whenever
 *     the temperature is known, and it is the term a hand calculation always
 *     forgets.
 *
 * The temperature term is a *bias*, not a random error, and strictly it should
 * be corrected rather than propagated. It is included as an uncertainty because
 * the working temperature is usually not known to better than a degree or two,
 * and that ignorance is what the term represents.
 */
export function glasswareUncertainty({ kind, nominalMl, temperatureC, grade = 'A' }) {
  if (grade !== 'A' && grade !== 'B') fail('unknownGrade', { grade });
  const tolerance = toleranceFor(kind, nominalMl) * (grade === 'B' ? 2 : 1);
  const components = [
    { name: 'tolerance', unc: rectangularStandardUncertainty(tolerance) },
  ];
  if (temperatureC !== undefined && temperatureC !== null) {
    requireFinite(temperatureC, 'temperatureC');
    const delta = Math.abs(temperatureC - REFERENCE_TEMPERATURE_C);
    if (delta > 0) {
      components.push({
        name: 'temperature',
        unc: rectangularStandardUncertainty(nominalMl * WATER_MINUS_GLASS_EXPANSION * delta),
      });
    }
  }
  // Independent random terms, so quadrature — `sumUncertainty` with the value
  // term at zero, which is the shape it already has for a sum of corrections.
  const { unc } = sumUncertainty(components.map((c) => ({ value: 0, unc: c.unc })));
  return { value: nominalMl, unc, components, unit: 'mL' };
}

/**
 * The uncertainty on a mass read from a balance.
 *
 * Three components, and the two that matter are not the one people expect:
 *
 *   - **readability** — the display rounds to the nearest increment `d`, so the
 *     true value is within ±d/2 with equal probability. Half-width d/2, not d.
 *     Treating readability as the balance's accuracy is the single most common
 *     mistake in student uncertainty budgets; a balance that reads to 0.1 mg is
 *     not accurate to 0.1 mg.
 *   - **linearity** — the manufacturer's ±a for deviation from a true straight
 *     line across the range, rectangular. Counted **twice** when the balance is
 *     tared, because weighing by difference reads it twice and the same curve
 *     error applies both times. Eurachem QUAM:2012 §8.1.4 works tare and gross
 *     separately for exactly this reason. Omitting it understates the
 *     uncertainty by 41%.
 *   - **repeatability** — the standard deviation of repeated weighings, when
 *     the caller has it. This is the figure that actually governs the balance's
 *     accuracy, and the one a datasheet usually does not print; it is optional
 *     because a caller who has not measured it must not have one invented.
 *
 * `minimumWeightG` is the balance's own published minimum. Below it the
 * uncertainty is a larger share of the reading than the tolerance allows, and
 * that is a fact about the instrument the user needs rather than a number to
 * fold in — so it is reported, not propagated.
 */
export function weighingUncertainty({
  massG, readabilityG, linearityG = 0, repeatabilityG, tared = true, minimumWeightG,
}) {
  requireNonNegative(massG, 'massG');
  requirePositive(readabilityG, 'readabilityG');
  requireNonNegative(linearityG, 'linearityG');
  if (repeatabilityG !== undefined && repeatabilityG !== null) {
    requireNonNegative(repeatabilityG, 'repeatabilityG');
  }

  const components = [
    { name: 'readability', unc: rectangularStandardUncertainty(readabilityG / 2) },
  ];
  if (linearityG > 0) {
    const lin = rectangularStandardUncertainty(linearityG) * (tared ? Math.SQRT2 : 1);
    components.push({ name: 'linearity', unc: lin, counted: tared ? 2 : 1 });
  }
  if (repeatabilityG > 0) {
    // A standard deviation is already a standard uncertainty; no distribution
    // divisor applies, and dividing again would understate it.
    components.push({ name: 'repeatability', unc: repeatabilityG });
  }

  const { unc } = sumUncertainty(components.map((c) => ({ value: 0, unc: c.unc })));
  const belowMinimum = minimumWeightG !== undefined
    && minimumWeightG !== null && massG > 0 && massG < minimumWeightG;
  return {
    value: massG,
    unc,
    components,
    unit: 'g',
    belowMinimumWeight: belowMinimum,
    minimumWeightG: minimumWeightG ?? null,
  };
}

/**
 * The uncertainty on a quantity, dispatched by instrument.
 *
 * One entry point so a caller does not have to know which table applies. A
 * `balance` is the mass case; everything else is volumetric.
 */
export function instrumentUncertainty(spec) {
  const { kind } = spec ?? {};
  if (kind === 'balance') return weighingUncertainty(spec);
  if (INSTRUMENT_KINDS.includes(kind)) return glasswareUncertainty(spec);
  fail('unknownInstrument', { kind });
}
