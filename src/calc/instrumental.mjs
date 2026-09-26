/**
 * Instrumental analysis: detection limits, chromatography, atomic spectroscopy,
 * fluorescence.
 *
 * ## What this adds
 *
 * `reagent.mjs` already fits a standard curve and reports its residuals.
 * `SpectroTab` shows the curve, the R², and warns when a reading falls outside
 * the range the standards covered. What none of that answers is the question
 * every method-validation section has to answer: **how little can this method
 * see?** That is the detection limit, and it is not a property of the
 * instrument alone — it depends on the calibration, on the blank, and on how
 * many replicate blank readings were taken.
 *
 * The four groups here are the routine figures of merit for an instrumental
 * method:
 *
 *   1. **Detection and quantification limits.** LOD and LOQ from the standard
 *      deviation of the blank and the slope of the calibration. The constants
 *      (3.3 and 10) are conventions with a statistical derivation behind them,
 *      and applying them to a slope from a two-point calibration is a common
 *      and invisible error — so the fit's own quality is reported alongside.
 *
 *   2. **Chromatography.** Resolution, theoretical plates, and capacity factor.
 *      Resolution below 1.5 means two peaks are not separated, and a method
 *      reporting both of them as pure is wrong by whatever they overlap.
 *
 *   3. **Atomic spectroscopy.** Sensitivity and characteristic concentration
 *      for AAS, where the working range is narrow and curvature sets in early.
 *
 *   4. **Fluorescence.** Quantum yield by comparison against a standard, and
 *      the inner-filter correction that becomes necessary exactly when the
 *      sample is concentrated enough to be worth measuring.
 *
 * Pure functions, no I/O — errors are codes (see errors.mjs).
 */
import { fail, requirePositive, requireNonNegative, requireFinite } from './errors.mjs';

/**
 * The IUPAC detection limit from a blank and a calibration slope.
 *
 *   LOD = 3.3 · s_blank / m
 *   LOQ = 10 · s_blank / m
 *
 * ## Where the constants come from
 *
 * They are not arbitrary. The detection limit is the concentration whose signal
 * is distinguishable from the blank at a stated confidence, and for a normal
 * blank distribution that is t·σ. At the replicate counts a validation
 * actually uses, t is close to 3.3 for the one-sided 95% case — and the
 * convention has held at 3.3 ever since. The 10 for quantification comes from
 * the relative standard deviation falling below about 10% at that point.
 *
 * ## The assumption that is usually skipped
 *
 * `s_blank` must be the standard deviation of *replicate* blank measurements —
 * at least seven, conventionally, and the constant is only calibrated for that
 * many. A single blank reading has no standard deviation at all, and using the
 * residual standard error of the calibration in its place is a different
 * quantity that gives a systematically different answer. This takes the blank
 * replicates and computes the deviation itself, so the caller cannot
 * accidentally pass one number.
 *
 * The slope must come from a calibration with real spread. A two-point
 * calibration through the origin has no residuals, so `slopeUncertainty` comes
 * back null and `reliable` is false — the detection limit is still computed,
 * because the formula needs only the slope, but the caller is told that the
 * slope itself is not supported by the data.
 */
export function detectionLimit({ blankReadings, slope, slopeStdError = null }) {
  if (!Array.isArray(blankReadings) || blankReadings.length < 2) {
    fail('lodTooFewBlanks', {
      n: Array.isArray(blankReadings) ? blankReadings.length : 0, min: 2,
    });
  }
  for (const b of blankReadings) requireFinite(b, 'blankReading');
  requirePositive(slope, 'slope');

  const n = blankReadings.length;
  const mean = blankReadings.reduce((a, b) => a + b, 0) / n;
  const ss = blankReadings.reduce((acc, b) => acc + (b - mean) ** 2, 0);
  const sdBlank = Math.sqrt(ss / (n - 1));

  if (sdBlank === 0) {
    /*
     * Every blank reading identical. That is what an instrument with a
     * perfectly stable baseline and a rounded readout produces, and it makes
     * the detection limit zero — which is not a detection limit. Reported as
     * such rather than as a very small number.
     */
    return {
      blankMean: mean,
      blankSd: 0,
      lod: 0,
      loq: 0,
      n,
      reliable: false,
      note: 'zeroBlankSpread',
    };
  }

  const lod = 3.3 * sdBlank / slope;
  const loq = 10 * sdBlank / slope;

  /*
   * The convention wants at least seven blank replicates. Fewer gives a
   * standard deviation with so few degrees of freedom that the detection limit
   * is dominated by the estimate's own uncertainty.
   */
  return {
    blankMean: mean,
    blankSd: sdBlank,
    lod,
    loq,
    n,
    slope,
    slopeStdError,
    // The slope is the other half of the calculation; a detection limit built
    // on an unsupported slope is only as good as that slope.
    slopeSupported: slopeStdError !== null && slopeStdError > 0,
    reliable: n >= 7 && slopeStdError !== null && slopeStdError > 0,
    // Below seven replicates the constant 3.3 is no longer the right one.
    replicatesAdequate: n >= 7,
  };
}

/**
 * Whether a measured concentration is above the detection limit.
 *
 * A result below the LOD is not a small number, it is "not detected" — the
 * distinction matters because a number below the detection limit carries no
 * information about how much is there, and averaging such numbers into a mean
 * biases it in a direction that depends on which side of the limit they fall.
 */
export function detectionStatus({ conc, lod, loq }) {
  requireFinite(conc, 'concentration');
  requireNonNegative(lod, 'lod');
  requireNonNegative(loq, 'loq');
  if (conc < lod) return { status: 'notDetected', usable: false };
  if (conc < loq) return { status: 'detectedNotQuantifiable', usable: false };
  return { status: 'quantifiable', usable: true };
}

/**
 * Chromatographic resolution between two adjacent peaks.
 *
 *   Rs = 2(t₂ − t₁) / (w₁ + w₂)
 *
 * The number that decides whether two peaks are separated. The convention:
 *
 *   Rs < 1.0   not separated — the peaks overlap and neither area is reliable
 *   Rs 1.0–1.5 marginal; about 2% of each peak is in the other
 *   Rs ≥ 1.5   baseline resolved, which is the usual acceptance criterion
 *
 * Widths are accepted at whatever unit the retention times are in — usually
 * minutes — as long as the two agree. Mixing seconds and minutes here gives a
 * resolution wrong by a factor of 60 that still looks like a plausible number.
 */
export function resolution({ t1, t2, w1, w2 }) {
  requireFinite(t1, 'retentionTime1');
  requireFinite(t2, 'retentionTime2');
  requirePositive(w1, 'peakWidth1');
  requirePositive(w2, 'peakWidth2');
  if (t2 === t1) fail('chromatographySameRetention', {});

  const [earlier, later] = t1 < t2 ? [t1, t2] : [t2, t1];
  const rs = 2 * (later - earlier) / (w1 + w2);

  return {
    resolution: rs,
    baselineResolved: rs >= 1.5,
    // Between 1.0 and 1.5 the peaks are partly separated: usable for
    // identification, not for accurate integration.
    marginal: rs >= 1.0 && rs < 1.5,
    // Below 1.0 the two are one peak with a shoulder.
    merged: rs < 1.0,
  };
}

/**
 * Theoretical plate count from a peak.
 *
 *   N = 16·(t_r/w)²      or      N = 5.54·(t_r/w½)²
 *
 * The two forms use the baseline width and the width at half height
 * respectively, and the constants differ because the two widths are related by
 * a factor of about 1.7 for a Gaussian peak. Using 16 with a half-height width
 * overstates the plate count by a factor of nearly 3, which makes a mediocre
 * column look excellent.
 *
 * `widthBasis` selects which width was supplied, so the right constant is used
 * rather than the caller having to remember.
 */
export function theoreticalPlates({ retentionTime, width, widthBasis = 'baseline' }) {
  requirePositive(retentionTime, 'retentionTime');
  requirePositive(width, 'peakWidth');
  if (widthBasis !== 'baseline' && widthBasis !== 'halfHeight') {
    fail('chromatographyUnknownWidthBasis', { basis: widthBasis });
  }
  const k = widthBasis === 'baseline' ? 16 : 5.54;
  const N = k * (retentionTime / width) ** 2;

  // Plate height, the plate count expressed per unit of column length. This is
  // the figure that compares two columns of different lengths.
  return { plates: N, widthBasis, constant: k };
}

/** Plate height, h = L/N. */
export function plateHeight({ columnLengthMm, plates }) {
  requirePositive(columnLengthMm, 'columnLength');
  requirePositive(plates, 'plates');
  return { heightMm: columnLengthMm / plates };
}

/**
 * Capacity (retention) factor.
 *
 *   k' = (t_r − t_m) / t_m
 *
 * The retention time measured relative to an unretained marker, which is what
 * makes it comparable between instruments — the raw retention time is not,
 * because it depends on flow rate and column dimensions.
 *
 * A capacity factor below about 1 means the analyte elutes too close to the
 * solvent front to be measured reliably; above about 20 the run takes
 * unnecessarily long and the peak broadens.
 */
export function capacityFactor({ retentionTime, voidTime }) {
  requirePositive(retentionTime, 'retentionTime');
  requirePositive(voidTime, 'voidTime');
  if (retentionTime <= voidTime) {
    // Eluting at or before the void volume means the analyte is not retained
    // by the stationary phase at all.
    fail('chromatographyUnretained', {
      retention: retentionTime, voidTime,
    });
  }
  const k = (retentionTime - voidTime) / voidTime;
  return {
    k,
    inRange: k >= 1 && k <= 20,
    tooEarly: k < 1,
    tooLate: k > 20,
  };
}

/**
 * Selectivity factor between two peaks: the ratio of their capacity factors.
 *
 *   α = k'₂ / k'₁
 *
 * α = 1 means the two compounds are not separated by this stationary phase at
 * all, no matter how good the column is — resolution can be improved by more
 * plates or a longer run, but not by either if α is 1. This is the number that
 * says whether a method is worth optimising or needs a different column.
 */
export function selectivity({ k1, k2 }) {
  requirePositive(k1, 'capacityFactor1');
  requirePositive(k2, 'capacityFactor2');
  const [lo, hi] = k1 <= k2 ? [k1, k2] : [k2, k1];
  const alpha = hi / lo;
  return {
    alpha,
    // Below about 1.05 the pair will not separate on this phase.
    separable: alpha > 1.05,
    // The resolving power equation shows how many plates are needed: N ≈
    // 16·Rs²·((α+1)/(α−1))²·((k'+1)/k')². Reported so the cost is visible.
    note: alpha <= 1.05 ? 'needsDifferentPhase' : 'separable',
  };
}

/**
 * Characteristic concentration for atomic absorption.
 *
 *   C₀ = 0.0044 · C / A
 *
 * The concentration that produces an absorbance of 0.0044, which is 1%
 * absorption. It is the standard sensitivity figure for AAS because it sits on
 * the linear part of the curve — unlike a detection limit, it describes the
 * middle of the working range rather than its edge.
 *
 * The 0.0044 is not arbitrary: 1% absorption is an absorbance of
 * −log₁₀(0.99) = 0.00436.
 */
export function characteristicConcentration({ conc, absorbance }) {
  requirePositive(conc, 'concentration');
  requirePositive(absorbance, 'absorbance');
  return {
    characteristic: 0.0044 * conc / absorbance,
    // The absorbance this was derived from, so a reading taken outside the
    // linear range is visible.
    sourceAbsorbance: absorbance,
  };
}

/**
 * Whether an atomic spectroscopy reading is in the linear working range.
 *
 * AAS and flame emission both curve toward the concentration axis above about
 * 0.5–0.8 absorbance, so a calibration that looks linear across a wide range
 * is usually being fitted through curvature. This is a separate check from the
 * Beer's law one in `reagent.mjs` because the useful ceiling is lower for
 * atomic methods than for molecular ones.
 */
export const AAS_LINEAR_MAX = 0.8;

/** Whether an absorbance is inside the range atomic methods stay linear over. */
export function withinAasRange(absorbance) {
  requireNonNegative(absorbance, 'absorbance');
  return {
    linear: absorbance <= AAS_LINEAR_MAX,
    absorbance,
    max: AAS_LINEAR_MAX,
  };
}

/**
 * Fluorescence quantum yield by comparison with a standard.
 *
 *   Φ_x = Φ_std · (A_std/A_x) · (F_x/F_std) · (n_x/n_std)²
 *
 * The standard is a compound of known quantum yield measured under the same
 * conditions — quinine sulfate in 0.1 M sulfuric acid is the usual one. The
 * refractive index term is squared because it appears in both the excitation
 * intensity and the collection efficiency, and dropping it is a small error for
 * water against water but a large one for water against ethanol.
 *
 * ## The absorbance limit
 *
 * The comparison assumes the solutions absorb the same fraction of the
 * excitation light, which holds only while both absorbances are small. Above
 * about 0.05 the inner filter effect makes the measured intensity no longer
 * proportional to concentration, and the quantum yield comes out low. The
 * function reports whether the inputs were inside that range rather than
 * silently applying a correction that the data cannot support.
 */
export function quantumYield({
  referenceYield, refAbsorbance, refIntensity, refIndex = 1.333,
  sampleAbsorbance, sampleIntensity, sampleIndex = 1.333,
}) {
  requirePositive(referenceYield, 'referenceYield');
  requirePositive(refAbsorbance, 'referenceAbsorbance');
  requirePositive(refIntensity, 'referenceIntensity');
  requirePositive(sampleAbsorbance, 'sampleAbsorbance');
  requirePositive(sampleIntensity, 'sampleIntensity');
  requirePositive(refIndex, 'referenceRefractiveIndex');
  requirePositive(sampleIndex, 'sampleRefractiveIndex');

  const absorbanceRatio = refAbsorbance / sampleAbsorbance;
  const intensityRatio = sampleIntensity / refIntensity;
  const indexTerm = (sampleIndex / refIndex) ** 2;
  const phi = referenceYield * absorbanceRatio * intensityRatio * indexTerm;

  // Both absorbances must be inside the dilute regime for the comparison to
  // hold. 0.05 is the conventional ceiling.
  const dilute = refAbsorbance <= 0.05 && sampleAbsorbance <= 0.05;

  return {
    quantumYield: phi,
    absorbanceRatio,
    intensityRatio,
    indexTerm,
    dilute,
    // Above 0.1 the inner filter effect is not a small correction; it is the
    // dominant error and the number should not be trusted.
    needsInnerFilterCorrection: refAbsorbance > 0.1 || sampleAbsorbance > 0.1,
  };
}

/**
 * Inner-filter correction for a fluorescence reading.
 *
 *   F_corr = F_obs · 10^((A_ex + A_em)/2)
 *
 * The measured intensity is attenuated by the sample's own absorbance at both
 * the excitation and the emission wavelength, and the correction is the
 * geometric mean of the two attenuations. It is worth applying once absorbances
 * exceed about 0.05 and is essential past 0.1.
 */
export function innerFilterCorrection({ observed, absorbanceEx, absorbanceEm }) {
  requireFinite(observed, 'observedIntensity');
  requireNonNegative(absorbanceEx, 'absorbanceExcitation');
  requireNonNegative(absorbanceEm, 'absorbanceEmission');
  const exponent = (absorbanceEx + absorbanceEm) / 2;
  return {
    corrected: observed * 10 ** exponent,
    factor: 10 ** exponent,
    exponent,
  };
}
