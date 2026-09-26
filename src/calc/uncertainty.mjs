/**
 * Measurement uncertainty, and how it propagates through a calculation.
 *
 * ## Why this exists
 *
 * Every number this app produced before this module was a point value: "weigh
 * 5.844 g". But 5.844 g is not a measurement, it is the middle of an interval.
 * A four-place balance reading 5.844 g means 5.844 ± 0.001 g, and the sodium
 * chloride in that beaker is only 58.44 ± 0.01 g/mol. Multiplying the two and
 * quoting six digits — which the app did — claims a precision that neither
 * instrument supports.
 *
 * A working chemist knows to carry the uncertainty by hand. The point of
 * computing it here is that the hand version is where mistakes live: the rules
 * differ between sums and products, and the difference between an uncertainty
 * of 0.2% and 20% decides whether an experiment is worth running.
 *
 * ## The two rules, and why they are not one rule
 *
 * For a **sum or difference**, absolute uncertainties add in quadrature:
 *
 *     σ_f = √(Σ σᵢ²)
 *
 * For a **product or quotient**, *relative* uncertainties add in quadrature:
 *
 *     σ_f/f = √(Σ (nᵢ·σᵢ/xᵢ)²)
 *
 * Applying the wrong one is the classic error. Adding absolute uncertainties
 * for a product understates badly (a 1% error in each of three factors is 1.7%,
 * not 0.03%), and adding relative uncertainties for a sum overstates just as
 * badly when the terms differ in magnitude.
 *
 * Quadrature rather than straight addition because the errors are independent
 * and random: they are as likely to cancel as to reinforce, so the expected
 * total is the root-sum-square. Straight addition is the worst case, which is
 * the right answer only when every error is systematically in the same
 * direction.
 *
 * ## What this does not model
 *
 * Only *random* error. A systematic error — a balance that reads 2 mg high, a
 * volumetric flask that is out of tolerance in one direction — does not average
 * out and does not combine in quadrature. It is also invisible in the data. No
 * amount of arithmetic here can find it; only a calibration standard can.
 *
 * Correlated inputs are likewise treated as independent. Two volumes measured
 * with the same pipette share its error, and the true uncertainty is larger
 * than this returns. That is a real limitation and the reason a result from
 * here is an estimate, not a guarantee.
 *
 * Pure functions, no I/O — errors are codes (see errors.mjs).
 */
import { fail, requireFinite } from './errors.mjs';
import { molarMassBreakdown } from './solution.mjs';

/**
 * Standard atomic weight uncertainties, in unified atomic mass units.
 *
 * IUPAC 2021 abridged values. These are the numbers behind the ± on a molar
 * mass, and they split into two populations that behave very differently:
 *
 *   - **Monoisotopic elements** (Na, Al, P, F, Au, …) have exactly one stable
 *     isotope, so their atomic weight is a physical constant known to nine or
 *     ten digits. Their contribution to an uncertainty is nil, and several are
 *     given here as 0 rather than as a tiny number that would be lost in
 *     floating-point noise.
 *
 *   - **Elements with variable isotopic composition** (H, C, N, O, S, B, Li)
 *     have a weight that depends on where the sample came from. IUPAC publishes
 *     an interval for these, not a value — carbon is 12.0096 to 12.0116
 *     depending on the source. The abridged value sits in the middle and the
 *     uncertainty below is half the interval width, which is genuinely how well
 *     the number is known. This is why NaCl is 58.44 ± 0.01 and not 58.4428.
 *
 * An element absent from this table is treated as exact. That is correct for
 * the monoisotopic heavy elements and optimistic for a handful of others, so
 * the table deliberately covers every element that appears in an ordinary lab
 * reagent. A molar mass built from something exotic will report an uncertainty
 * that is too small, and the module says so rather than inventing a number.
 */
export const ATOMIC_WEIGHT_UNCERTAINTY = {
  H: 0.0002, He: 0.000002, Li: 0.06, Be: 0, B: 0.02, C: 0.002,
  N: 0.001, O: 0.001, F: 0, Ne: 0.0006, Na: 0, Mg: 0.002,
  Al: 0, Si: 0.001, P: 0, S: 0.02, Cl: 0.01, Ar: 0.001,
  K: 0.0001, Ca: 0.004, Sc: 0, Ti: 0.0001, V: 0.0001, Cr: 0.0001,
  Mn: 0, Fe: 0.0001, Co: 0, Ni: 0.0001, Cu: 0.0001, Zn: 0.0001,
  Ga: 0.0001, Ge: 0.0001, As: 0.0001, Se: 0.0002, Br: 0.0001,
  Kr: 0.0001, Rb: 0.0001, Sr: 0.0001, Y: 0.0001, Zr: 0.0001,
  Nb: 0.0001, Mo: 0.0001, Ru: 0.0001, Rh: 0, Pd: 0.0001,
  Ag: 0.0001, Cd: 0.0001, In: 0.0001, Sn: 0.0001, Sb: 0.0001,
  Te: 0.0001, I: 0.0001, Xe: 0.0001, Cs: 0.0001, Ba: 0.0001,
  La: 0.0001, Ce: 0.0001, Pr: 0.0001, Nd: 0.0001, Sm: 0.0001,
  Eu: 0.0001, Gd: 0.0001, Tb: 0, Dy: 0.0001, Ho: 0, Er: 0.0001,
  Tm: 0, Yb: 0.0001, Lu: 0.0001, Hf: 0.0001, Ta: 0.0001,
  W: 0.0001, Re: 0.0001, Os: 0.0001, Ir: 0.0001, Pt: 0.0001,
  Au: 0.0001, Hg: 0.0001, Tl: 0.0001, Pb: 0.0001, Bi: 0.0001,
  Th: 0.0001, U: 0.0001,
};

/**
 * An uncertainty for an element the table does not list.
 *
 * Zero, not a guess. Inventing a plausible-looking uncertainty would put a
 * fabricated number into a result the user reads as measured — worse than
 * admitting the table does not cover it. The elements that matter are in the
 * table; see the note above it.
 */
const UNLISTED_ATOMIC_UNCERTAINTY = 0;

/** A measured quantity: a value with a standard uncertainty of the same unit. */
export function quantity(value, unc = 0) {
  requireFinite(value, 'value');
  requireFinite(unc, 'uncertainty');
  if (unc < 0) fail('uncertaintyNegative', { unc });
  return { value, unc: Math.abs(unc) };
}

/**
 * Relative uncertainty: σ/x.
 *
 * Returns 0 for an exactly-zero value rather than dividing. A zero value with
 * a zero uncertainty is exact (a count, a definition), and the alternative —
 * Infinity — would poison every product it entered.
 */
export function relativeUncertainty({ value, unc }) {
  if (unc === 0) return 0;
  if (value === 0) fail('uncertaintyZeroValue', { unc });
  return Math.abs(unc / value);
}

/**
 * Propagate through a sum or difference: σ_f = √(Σ (nᵢ·σᵢ)²).
 *
 * Each term is `{ value, unc, factor }` where `factor` is the signed
 * coefficient — negative for a subtracted term. The sign does not survive into
 * the result because the terms are squared, which is the point: subtracting a
 * noisy quantity makes the answer *less* certain, not more. A difference of two
 * large nearly-equal numbers is the worst case in all of measurement, and this
 * reports the blow-up rather than hiding it.
 */
export function sumUncertainty(terms) {
  if (!Array.isArray(terms) || terms.length === 0) {
    fail('uncertaintyNoTerms', {});
  }
  let value = 0;
  let variance = 0;
  for (const term of terms) {
    const { value: v, unc = 0, factor = 1 } = term ?? {};
    requireFinite(v, 'value');
    requireFinite(unc, 'uncertainty');
    requireFinite(factor, 'factor');
    value += factor * v;
    variance += (factor * unc) ** 2;
  }
  return { value, unc: Math.sqrt(variance) };
}

/**
 * Propagate through a product or quotient: σ_f/f = √(Σ (nᵢ·σᵢ/xᵢ)²).
 *
 * Each term is `{ value, unc, power }`, where `power` is the exponent — 1 for a
 * numerator, −1 for a denominator, 2 for a square. The exponent multiplies the
 * relative uncertainty, which is why squaring a measurement doubles its
 * relative error and taking a square root halves it. That factor is the whole
 * reason the two rules are separate functions.
 *
 * A `factor` scales the result without contributing uncertainty: it is a
 * definition (1000 mL per litre, a stoichiometric coefficient), not a
 * measurement.
 */
export function productUncertainty(terms, { factor = 1 } = {}) {
  if (!Array.isArray(terms) || terms.length === 0) {
    fail('uncertaintyNoTerms', {});
  }
  requireFinite(factor, 'factor');
  let value = factor;
  let variance = 0;
  for (const term of terms) {
    const { value: v, unc = 0, power = 1 } = term ?? {};
    requireFinite(v, 'value');
    requireFinite(unc, 'uncertainty');
    requireFinite(power, 'power');
    if (v === 0) {
      // A zero factor with an uncertainty makes the relative form undefined;
      // the product is exactly zero only if the uncertainty is zero too.
      if (unc === 0) { value = 0; continue; }
      fail('uncertaintyZeroValue', { unc });
    }
    value *= v ** power;
    variance += (power * (unc / v)) ** 2;
  }
  return { value, unc: Math.abs(value) * Math.sqrt(variance) };
}

/**
 * Significant figures justified by an uncertainty.
 *
 * The convention every analytical text uses: quote the uncertainty to one or
 * two significant figures, and the value to the same decimal place. A result of
 * 0.1023 ± 0.0004 has three figures; 0.1023 ± 0.04 has two and belongs written
 * as 0.10 ± 0.04.
 *
 * Two figures for the uncertainty when the leading digit is 1 or 2 — 0.12 and
 * 0.13 are meaningfully different, while 0.4 and 0.5 are not, so one figure
 * loses information exactly where the uncertainty is smallest.
 *
 * Returns the count of significant figures the *value* deserves, which is what
 * a formatter needs.
 */
export function significantFigures({ value, unc }) {
  requireFinite(value, 'value');
  requireFinite(unc, 'uncertainty');
  if (unc === 0) return null; // exact: no limit from the uncertainty
  if (value === 0) return 1;
  // The decade the uncertainty occupies, then how many digits of the value sit
  // at or above it. A 5.8437 ± 0.0012 spans decades −3 to 0, so four figures.
  const uncExponent = Math.floor(Math.log10(Math.abs(unc)));
  const valueExponent = Math.floor(Math.log10(Math.abs(value)));
  return Math.max(1, valueExponent - uncExponent + uncertaintyFigures(unc) - 1);
}

/** Round to a number of significant figures, returning a number. */
export function roundToSignificant(value, figures) {
  requireFinite(value, 'value');
  if (!Number.isInteger(figures) || figures < 1) {
    fail('mustBePositive', { name: 'figures', value: figures });
  }
  if (value === 0) return 0;
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const shift = figures - 1 - exponent;
  const factor = 10 ** shift;
  /*
   * `Math.round` on the scaled value, not `toPrecision`, because
   * `toPrecision` returns a string and re-parsing it reintroduces the
   * binary-representation error it was meant to remove. The `Number(...)`
   * wrapper is doing real work: it re-reads the rounded decimal so that
   * 0.1 + 0.2 style residue does not survive into the displayed figure.
   */
  return Number((Math.round(value * factor) / factor).toPrecision(figures));
}

/**
 * Round a value to the decimal place its uncertainty occupies.
 *
 * This is the operation that turns 5.843721 ± 0.0012 into 5.8437 ± 0.0012, and
 * the one a hand calculation gets wrong by rounding twice. Rounding the
 * uncertainty and the value independently can leave the pair inconsistent by a
 * digit, so the place is decided once from the uncertainty and applied to both.
 */
export function roundPair({ value, unc }) {
  requireFinite(value, 'value');
  requireFinite(unc, 'uncertainty');
  if (unc === 0) return { value, unc: 0 };

  const figures = uncertaintyFigures(unc);
  const uncRounded = roundToSignificant(unc, figures);
  /*
   * The column is the uncertainty's LAST significant digit, not its first.
   *
   * An uncertainty of 0.0012 quoted to two figures ends in the ten-thousandths,
   * so the value must be rounded there too — 5.8437 ± 0.0012, not 5.844 ±
   * 0.0012. Rounding to the leading digit instead (10⁻³ here) leaves the pair
   * inconsistent by a digit, which is the whole thing this function exists to
   * prevent. The `figures - 1` is what walks back from the first digit to the
   * last.
   */
  const place = Math.floor(Math.log10(Math.abs(uncRounded))) - (figures - 1);
  const scale = 10 ** place;
  return {
    value: Number((Math.round(value / scale) * scale).toPrecision(15)),
    unc: uncRounded,
  };
}

/**
 * How many significant figures the uncertainty itself is quoted to.
 *
 * Two when it starts with 1 or 2, one otherwise. The asymmetry is real: 0.12
 * and 0.13 differ by enough to change a decision, while the difference between
 * 0.4 and 0.5 is inside the noise of the estimate itself.
 */
export function uncertaintyFigures(unc) {
  requireFinite(unc, 'uncertainty');
  const a = Math.abs(unc);
  if (a === 0) return 1;
  const leading = Math.floor(a / 10 ** Math.floor(Math.log10(a)));
  return leading <= 2 ? 2 : 1;
}

/**
 * The uncertainty on a molar mass, from the uncertainties on its elements.
 *
 * A sum, not a product: the molar mass of a formula is Σ nᵢ·Aᵢ, so the
 * coefficients are the subscripts and the rule is absolute uncertainties in
 * quadrature. Each term is exact-with-a-count, which is why the subscript
 * multiplies the uncertainty rather than contributing one of its own.
 *
 * The number is small and that is the point. NaCl is 58.44 ± 0.01 g/mol, so
 * weighing 5.844 g of it carries a 0.017% uncertainty from the molar mass — an
 * order of magnitude below what a four-place balance contributes. Reporting it
 * is what shows that the balance, not the formula table, is what limits the
 * experiment.
 *
 * `unknownElements` lists any element missing from the uncertainty table. Those
 * contribute zero, so the returned uncertainty is a lower bound, and a caller
 * that wants to be honest with the user needs to know that.
 */
export function molarMassUncertainty(formula) {
  const { terms, total } = molarMassBreakdown(formula);
  const contributions = terms.map(({ element, count, contribution }) => ({
    element,
    count,
    contribution,
    atomicUncertainty: ATOMIC_WEIGHT_UNCERTAINTY[element] ?? UNLISTED_ATOMIC_UNCERTAINTY,
  }));
  const unknownElements = contributions
    .filter((c) => !(c.element in ATOMIC_WEIGHT_UNCERTAINTY))
    .map((c) => c.element);

  const { unc } = sumUncertainty(
    contributions.map((c) => ({ value: c.contribution, unc: c.count * c.atomicUncertainty })),
  );
  return { molarMass: total, unc, contributions, unknownElements };
}
