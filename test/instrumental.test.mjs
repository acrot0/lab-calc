import { describe, expect, it } from 'vitest';
import {
  AAS_LINEAR_MAX, capacityFactor, characteristicConcentration, detectionLimit,
  detectionStatus, innerFilterCorrection, plateHeight, quantumYield, resolution,
  selectivity, theoreticalPlates, withinAasRange,
} from '../src/calc/instrumental.mjs';

/*
 * The reference values are the published figures of merit and hand
 * calculations from the defining equations. The chromatography constants in
 * particular are asserted by their exact values, so swapping 16 for 5.54 — the
 * error that makes a mediocre column look excellent — cannot pass.
 */

describe('detectionLimit', () => {
  it('should compute LOD and LOQ from the blank spread and the slope', () => {
    /*
     * Ten blank readings: three at -0.001, three at +0.001 and four at zero.
     * The mean is 0 and SS is 6 x 1e-6, so sd = sqrt(6e-6/9) = 8.1650e-4.
     *
     * LOD = 3.3 x 8.1650e-4 / 0.05 = 0.05389
     * LOQ = 10  x 8.1650e-4 / 0.05 = 0.16330
     */
    const blanks = [-0.001, 0, 0.001, -0.001, 0.001, 0, 0, -0.001, 0.001, 0];
    const r = detectionLimit({ blankReadings: blanks, slope: 0.05 });
    expect(r.blankSd).toBeCloseTo(Math.sqrt(6e-6 / 9), 12);
    expect(r.lod).toBeCloseTo(3.3 * r.blankSd / 0.05, 12);
    expect(r.loq).toBeCloseTo(10 * r.blankSd / 0.05, 12);
    expect(r.lod).toBeCloseTo(0.05389, 4);
    expect(r.loq).toBeCloseTo(0.16330, 4);
  });

  it('should give an LOQ about three times the LOD', () => {
    // The 10/3.3 ratio is the convention: quantify only where the relative
    // standard deviation has fallen to an acceptable level.
    const r = detectionLimit({
      blankReadings: [0.001, -0.001, 0.002, -0.002, 0, 0.001, -0.001], slope: 0.1,
    });
    expect(r.loq / r.lod).toBeCloseTo(10 / 3.3, 6);
  });

  it('should improve the detection limit as the slope steepens', () => {
    // A more sensitive method sees less: the same blank noise over a larger
    // signal per unit concentration gives a lower detection limit.
    const blanks = [0.001, -0.001, 0.002, -0.002, 0, 0.001, -0.001];
    const weak = detectionLimit({ blankReadings: blanks, slope: 0.05 });
    const strong = detectionLimit({ blankReadings: blanks, slope: 0.5 });
    expect(strong.lod).toBeLessThan(weak.lod);
    expect(strong.lod).toBeCloseTo(weak.lod / 10, 10);
  });

  it('should want at least seven blank replicates', () => {
    // The 3.3 constant is calibrated for seven or more. Below that the
    // deviation itself is too uncertain to carry it.
    const three = detectionLimit({ blankReadings: [0.001, -0.001, 0], slope: 0.1 });
    expect(three.replicatesAdequate).toBe(false);
    const seven = detectionLimit({
      blankReadings: [0.001, -0.001, 0.002, -0.002, 0, 0.001, -0.001], slope: 0.1,
    });
    expect(seven.replicatesAdequate).toBe(true);
  });

  it('should mark the slope unsupported when no standard error is given', () => {
    // A two-point calibration through the origin has no residuals, so the
    // slope has no uncertainty. The detection limit is still computable but
    // rests on an unsupported slope.
    const r = detectionLimit({
      blankReadings: [0.001, -0.001, 0.002, -0.002, 0, 0.001, -0.001], slope: 0.1,
    });
    expect(r.slopeSupported).toBe(false);
    expect(r.reliable).toBe(false);
  });

  it('should be reliable when the slope carries an uncertainty and blanks are enough', () => {
    const r = detectionLimit({
      blankReadings: [0.001, -0.001, 0.002, -0.002, 0, 0.001, -0.001],
      slope: 0.1,
      slopeStdError: 0.002,
    });
    expect(r.reliable).toBe(true);
  });

  it('should report a zero detection limit as unreliable rather than as excellent', () => {
    // Every blank reading identical gives sd = 0 and LOD = 0. A detection
    // limit of zero is not a detection limit; it means the instrument's
    // readout is rounded or the blank was not actually replicated.
    const r = detectionLimit({ blankReadings: [0, 0, 0, 0, 0, 0, 0], slope: 0.1 });
    expect(r.lod).toBe(0);
    expect(r.reliable).toBe(false);
    expect(r.note).toBe('zeroBlankSpread');
  });

  it('should refuse a single blank reading', () => {
    // One reading has no standard deviation, and the whole calculation is
    // built on one.
    expect(() => detectionLimit({ blankReadings: [0.001], slope: 0.1 })).toThrow();
  });

  it('should refuse a zero slope, which would divide by zero', () => {
    expect(() => detectionLimit({
      blankReadings: [0.001, -0.001], slope: 0,
    })).toThrow();
  });
});

describe('detectionStatus', () => {
  it('should call a result below the LOD not detected', () => {
    const r = detectionStatus({ conc: 0.01, lod: 0.05, loq: 0.15 });
    expect(r.status).toBe('notDetected');
    expect(r.usable).toBe(false);
  });

  it('should call a result between LOD and LOQ detected but not quantifiable', () => {
    // The middle band: the analyte is definitely there, but not in an amount
    // the method can put a number on.
    const r = detectionStatus({ conc: 0.1, lod: 0.05, loq: 0.15 });
    expect(r.status).toBe('detectedNotQuantifiable');
    expect(r.usable).toBe(false);
  });

  it('should call a result above the LOQ quantifiable', () => {
    const r = detectionStatus({ conc: 0.5, lod: 0.05, loq: 0.15 });
    expect(r.status).toBe('quantifiable');
    expect(r.usable).toBe(true);
  });

  it('should treat exactly the LOQ as quantifiable', () => {
    expect(detectionStatus({ conc: 0.15, lod: 0.05, loq: 0.15 }).usable).toBe(true);
  });
});

describe('resolution', () => {
  it('should compute Rs = 2(t2 - t1)/(w1 + w2)', () => {
    // t 5.0 and 6.0, widths 0.5 and 0.5: 2(1.0)/1.0 = 2.0.
    expect(resolution({ t1: 5, t2: 6, w1: 0.5, w2: 0.5 }).resolution).toBeCloseTo(2, 10);
  });

  it('should call 1.5 or above baseline resolved', () => {
    const r = resolution({ t1: 5, t2: 6.5, w1: 0.5, w2: 0.5 });
    expect(r.resolution).toBeCloseTo(3, 10);
    expect(r.baselineResolved).toBe(true);
  });

  it('should call the 1.0 to 1.5 band marginal', () => {
    // 2(0.6)/1.0 = 1.2: separated enough to identify, not to integrate.
    const r = resolution({ t1: 5, t2: 5.6, w1: 0.5, w2: 0.5 });
    expect(r.resolution).toBeCloseTo(1.2, 10);
    expect(r.marginal).toBe(true);
    expect(r.baselineResolved).toBe(false);
  });

  it('should call below 1.0 merged', () => {
    // 2(0.2)/1.0 = 0.4: one peak with a shoulder.
    const r = resolution({ t1: 5, t2: 5.2, w1: 0.5, w2: 0.5 });
    expect(r.merged).toBe(true);
    expect(r.baselineResolved).toBe(false);
  });

  it('should be independent of the order the peaks are given in', () => {
    const a = resolution({ t1: 5, t2: 6, w1: 0.5, w2: 0.5 });
    const b = resolution({ t1: 6, t2: 5, w1: 0.5, w2: 0.5 });
    expect(a.resolution).toBeCloseTo(b.resolution, 12);
  });

  it('should refuse two peaks at the same retention time', () => {
    expect(() => resolution({ t1: 5, t2: 5, w1: 0.5, w2: 0.5 })).toThrow();
  });
});

describe('theoreticalPlates', () => {
  it('should use 16 for a baseline width', () => {
    // N = 16 x (5/0.5)^2 = 16 x 100 = 1600.
    const r = theoreticalPlates({ retentionTime: 5, width: 0.5, widthBasis: 'baseline' });
    expect(r.plates).toBeCloseTo(1600, 6);
    expect(r.constant).toBe(16);
  });

  it('should use 5.54 for a half-height width', () => {
    // N = 5.54 x (5/0.5)^2 = 554.
    const r = theoreticalPlates({ retentionTime: 5, width: 0.5, widthBasis: 'halfHeight' });
    expect(r.plates).toBeCloseTo(554, 6);
    expect(r.constant).toBe(5.54);
  });

  it('should not overstate the plate count by using the wrong constant', () => {
    /*
     * The error this guards: applying 16 to a half-height width overstates the
     * plate count by a factor of 16/5.54 = 2.89, which turns an adequate
     * column into an excellent one. For a Gaussian peak the two widths differ
     * by about 1.7, so the same physical peak gives the same N through the
     * right constant.
     */
    const halfWidth = 0.294;
    const baselineWidth = halfWidth * 1.7;
    const viaHalf = theoreticalPlates({
      retentionTime: 5, width: halfWidth, widthBasis: 'halfHeight',
    });
    const viaBaseline = theoreticalPlates({
      retentionTime: 5, width: baselineWidth, widthBasis: 'baseline',
    });
    expect(viaHalf.plates).toBeCloseTo(viaBaseline.plates, -1);
  });

  it('should default to the baseline width', () => {
    const r = theoreticalPlates({ retentionTime: 5, width: 0.5 });
    expect(r.widthBasis).toBe('baseline');
  });

  it('should refuse an unknown width basis', () => {
    // Silently defaulting would use the wrong constant without saying so.
    expect(() => theoreticalPlates({
      retentionTime: 5, width: 0.5, widthBasis: 'sigma',
    })).toThrow();
  });

  it('should rise as the peak narrows', () => {
    const wide = theoreticalPlates({ retentionTime: 5, width: 1 });
    const narrow = theoreticalPlates({ retentionTime: 5, width: 0.5 });
    expect(narrow.plates).toBeGreaterThan(wide.plates);
  });
});

describe('plateHeight', () => {
  it('should divide the column length by the plate count', () => {
    // 150 mm over 15000 plates is 0.01 mm per plate.
    expect(plateHeight({ columnLengthMm: 150, plates: 15000 }).heightMm).toBeCloseTo(0.01, 10);
  });

  it('should refuse a zero plate count', () => {
    expect(() => plateHeight({ columnLengthMm: 150, plates: 0 })).toThrow();
  });
});

describe('capacityFactor', () => {
  it('should compute k from the void time', () => {
    // t_r 5.0, void 1.0: k = (5 - 1)/1 = 4.
    expect(capacityFactor({ retentionTime: 5, voidTime: 1 }).k).toBeCloseTo(4, 10);
  });

  it('should call k below 1 too early', () => {
    // Eluting close to the solvent front: the analyte is barely retained and
    // anything else in the sample interferes.
    const r = capacityFactor({ retentionTime: 1.5, voidTime: 1 });
    expect(r.k).toBeCloseTo(0.5, 10);
    expect(r.tooEarly).toBe(true);
    expect(r.inRange).toBe(false);
  });

  it('should call k above 20 too late', () => {
    const r = capacityFactor({ retentionTime: 25, voidTime: 1 });
    expect(r.tooLate).toBe(true);
    expect(r.inRange).toBe(false);
  });

  it('should call k between 1 and 20 in range', () => {
    expect(capacityFactor({ retentionTime: 5, voidTime: 1 }).inRange).toBe(true);
  });

  it('should refuse a retention time at or before the void volume', () => {
    // An unretained analyte has no capacity factor; dividing by the void time
    // gives zero or a negative number that means nothing.
    expect(() => capacityFactor({ retentionTime: 1, voidTime: 1 })).toThrow();
    expect(() => capacityFactor({ retentionTime: 0.5, voidTime: 1 })).toThrow();
  });
});

describe('selectivity', () => {
  it('should compute alpha as the ratio of capacity factors', () => {
    expect(selectivity({ k1: 2, k2: 4 }).alpha).toBeCloseTo(2, 10);
  });

  it('should be independent of the order the peaks are given in', () => {
    expect(selectivity({ k1: 4, k2: 2 }).alpha).toBeCloseTo(2, 10);
  });

  it('should say an alpha of 1 needs a different phase', () => {
    // The important case: with alpha = 1 no amount of extra plates or a longer
    // run will separate the pair. Only a different stationary phase will.
    const r = selectivity({ k1: 3, k2: 3 });
    expect(r.alpha).toBeCloseTo(1, 10);
    expect(r.separable).toBe(false);
    expect(r.note).toBe('needsDifferentPhase');
  });

  it('should call a near-unity alpha inseparable', () => {
    expect(selectivity({ k1: 3, k2: 3.1 }).separable).toBe(false);
  });

  it('should call a clearly larger alpha separable', () => {
    expect(selectivity({ k1: 2, k2: 3 }).separable).toBe(true);
  });

  it('should refuse a zero capacity factor', () => {
    expect(() => selectivity({ k1: 0, k2: 3 })).toThrow();
  });
});

describe('characteristicConcentration', () => {
  it('should compute the concentration giving 1% absorption', () => {
    // 5 mg/L giving A = 0.44: C0 = 0.0044 x 5 / 0.44 = 0.05 mg/L.
    const r = characteristicConcentration({ conc: 5, absorbance: 0.44 });
    expect(r.characteristic).toBeCloseTo(0.05, 10);
  });

  it('should give a lower characteristic concentration for a more sensitive method', () => {
    // Same concentration, larger absorbance: the method sees less.
    const weak = characteristicConcentration({ conc: 5, absorbance: 0.1 });
    const strong = characteristicConcentration({ conc: 5, absorbance: 0.8 });
    expect(strong.characteristic).toBeLessThan(weak.characteristic);
  });

  it('should return the absorbance it came from, so a curved reading is visible', () => {
    const r = characteristicConcentration({ conc: 5, absorbance: 1.2 });
    expect(r.sourceAbsorbance).toBe(1.2);
  });

  it('should refuse a zero absorbance', () => {
    expect(() => characteristicConcentration({ conc: 5, absorbance: 0 })).toThrow();
  });
});

describe('withinAasRange', () => {
  it('should accept an absorbance below the atomic ceiling', () => {
    expect(withinAasRange(0.5).linear).toBe(true);
  });

  it('should reject an absorbance above the atomic ceiling', () => {
    // 0.8 is lower than the 1.5 Beer's law limit: atomic methods curve earlier
    // than molecular ones.
    expect(withinAasRange(1.0).linear).toBe(false);
    expect(AAS_LINEAR_MAX).toBeLessThan(1.5);
  });

  it('should treat exactly the ceiling as linear', () => {
    expect(withinAasRange(AAS_LINEAR_MAX).linear).toBe(true);
  });
});

describe('quantumYield', () => {
  it('should give the reference yield when the sample matches it exactly', () => {
    // Identical conditions and intensities must return the reference yield.
    const r = quantumYield({
      referenceYield: 0.54,
      refAbsorbance: 0.04, refIntensity: 1000,
      sampleAbsorbance: 0.04, sampleIntensity: 1000,
    });
    expect(r.quantumYield).toBeCloseTo(0.54, 10);
  });

  it('should scale with the intensity ratio', () => {
    // Half the fluorescence at the same absorbance is half the yield.
    const r = quantumYield({
      referenceYield: 0.54,
      refAbsorbance: 0.04, refIntensity: 1000,
      sampleAbsorbance: 0.04, sampleIntensity: 500,
    });
    expect(r.quantumYield).toBeCloseTo(0.27, 10);
  });

  it('should correct for a lower sample absorbance', () => {
    // The sample absorbs half as much light, so its intensity must be doubled
    // to compare like with like.
    const r = quantumYield({
      referenceYield: 0.5,
      refAbsorbance: 0.04, refIntensity: 1000,
      sampleAbsorbance: 0.02, sampleIntensity: 1000,
    });
    expect(r.quantumYield).toBeCloseTo(1.0, 10);
  });

  it('should apply the refractive index term squared', () => {
    // Water 1.333 against ethanol 1.361: the term is (1.361/1.333)^2 = 1.0425.
    const r = quantumYield({
      referenceYield: 0.5,
      refAbsorbance: 0.04, refIntensity: 1000, refIndex: 1.333,
      sampleAbsorbance: 0.04, sampleIntensity: 1000, sampleIndex: 1.361,
    });
    expect(r.indexTerm).toBeCloseTo((1.361 / 1.333) ** 2, 10);
    expect(r.quantumYield).toBeCloseTo(0.5 * (1.361 / 1.333) ** 2, 10);
  });

  it('should flag a sample too concentrated for the comparison', () => {
    // Above about 0.05 absorbance the inner filter effect breaks the
    // proportionality the comparison relies on.
    const r = quantumYield({
      referenceYield: 0.54,
      refAbsorbance: 0.04, refIntensity: 1000,
      sampleAbsorbance: 0.2, sampleIntensity: 1000,
    });
    expect(r.dilute).toBe(false);
    expect(r.needsInnerFilterCorrection).toBe(true);
  });

  it('should accept a dilute pair', () => {
    const r = quantumYield({
      referenceYield: 0.54,
      refAbsorbance: 0.04, refIntensity: 1000,
      sampleAbsorbance: 0.04, sampleIntensity: 1000,
    });
    expect(r.dilute).toBe(true);
    expect(r.needsInnerFilterCorrection).toBe(false);
  });

  it('should refuse a zero sample absorbance', () => {
    expect(() => quantumYield({
      referenceYield: 0.5,
      refAbsorbance: 0.04, refIntensity: 1000,
      sampleAbsorbance: 0, sampleIntensity: 1000,
    })).toThrow();
  });
});

describe('innerFilterCorrection', () => {
  it('should correct by the geometric mean of the two absorbances', () => {
    // A_ex 0.2, A_em 0.2: the exponent is 0.2, so the factor is 10^0.2.
    const r = innerFilterCorrection({ observed: 100, absorbanceEx: 0.2, absorbanceEm: 0.2 });
    expect(r.exponent).toBeCloseTo(0.2, 10);
    expect(r.factor).toBeCloseTo(10 ** 0.2, 10);
    expect(r.corrected).toBeCloseTo(100 * 10 ** 0.2, 8);
  });

  it('should always raise the observed intensity', () => {
    // The sample attenuates its own emission, so the correction can only
    // increase the reading. A factor below 1 would mean the model had the
    // effect backwards.
    const r = innerFilterCorrection({ observed: 100, absorbanceEx: 0.3, absorbanceEm: 0.1 });
    expect(r.factor).toBeGreaterThan(1);
    expect(r.corrected).toBeGreaterThan(100);
  });

  it('should be the identity when neither absorbance is significant', () => {
    const r = innerFilterCorrection({ observed: 100, absorbanceEx: 0, absorbanceEm: 0 });
    expect(r.factor).toBeCloseTo(1, 12);
    expect(r.corrected).toBeCloseTo(100, 12);
  });

  it('should correct more when the excitation absorbance is higher', () => {
    const low = innerFilterCorrection({ observed: 100, absorbanceEx: 0.1, absorbanceEm: 0.1 });
    const high = innerFilterCorrection({ observed: 100, absorbanceEx: 0.4, absorbanceEm: 0.1 });
    expect(high.corrected).toBeGreaterThan(low.corrected);
  });
});
