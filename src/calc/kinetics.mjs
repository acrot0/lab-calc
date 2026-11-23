import { fail, requirePositive, requireFinite } from './errors.mjs';

/**
 * Enzyme & nanozyme steady-state kinetics (Michaelis–Menten) and
 * microplate time-course initial-rate extraction.
 *
 * Pure functions, no I/O — follows the same contract as curve.mjs and
 * analytical.mjs so every error throws a coded CalcError.
 */

function validatePairs(points) {
  if (!Array.isArray(points) || points.length < 3) {
    fail('kineticsNeedThreePoints', { count: Array.isArray(points) ? points.length : 0 });
  }
  const clean = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const s = Number(pt?.s);
    const v = Number(pt?.v);
    if (!Number.isFinite(s) || !Number.isFinite(v)) {
      fail('mustBeFinite', { name: `row ${i + 1}` });
    }
    if (s < 0) fail('mustNotBeNegative', { name: `substrate[${i + 1}]`, value: s });
    if (v < 0) fail('mustNotBeNegative', { name: `rate[${i + 1}]`, value: v });
    clean.push({ s, v });
  }
  const nonZeroS = clean.filter((p) => p.s > 0);
  if (nonZeroS.length < 3) {
    fail('kineticsNeedThreePoints', { count: nonZeroS.length });
  }
  return clean;
}

/**
 * Initial parameter guess via Lineweaver–Burk linear regression on positive points,
 * clamped to safe physical bounds so Levenberg–Marquardt always starts stably.
 */
function initialGuess(points) {
  const pos = points.filter((p) => p.s > 0 && p.v > 0);
  const maxV = Math.max(...points.map((p) => p.v), 1e-12);
  const medS = [...points].sort((a, b) => a.s - b.s)[Math.floor(points.length / 2)].s || 1;
  if (pos.length < 2) return { vmax: maxV * 1.15, km: medS };

  const xs = pos.map((p) => 1 / p.s);
  const ys = pos.map((p) => 1 / p.v);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) * (xs[i] - mx);
  }
  if (den <= 1e-24) return { vmax: maxV * 1.15, km: medS };
  const slope = num / den;
  const intercept = my - slope * mx;
  const vmax = intercept > 0 ? 1 / intercept : maxV * 1.15;
  const km = slope > 0 && vmax > 0 ? slope * vmax : medS;
  return {
    vmax: Number.isFinite(vmax) && vmax > 0 ? vmax : maxV * 1.15,
    km: Number.isFinite(km) && km > 0 ? km : medS,
  };
}

/**
 * Nonlinear least-squares fit (Levenberg–Marquardt) to the Michaelis–Menten equation:
 *
 *   v([S]) = (Vmax * [S]) / (Km + [S])
 *
 * @param {Array<{s: number, v: number}>} rawPoints  Substrate concentration & initial rate pairs
 * @param {object} [opts]
 * @param {number} [opts.enzymeConcM]  Optional active-site / enzyme molar concentration (mol/L)
 *                                     for computing kcat and catalytic efficiency (kcat/Km).
 *                                     When substrate [S] is in mM, kcat/Km is returned in M^-1 s^-1
 *                                     provided rate v is in mM/s (or matching units).
 * @param {number} [opts.substrateToMolar=1e-3]  Conversion factor from [S] unit to mol/L (default mM -> M)
 * @param {number} [opts.rateToMolarPerSec=1e-3] Conversion factor from v unit to mol/(L*s) (default mM/s -> M/s)
 */
export function fitMichaelisMenten(rawPoints, opts = {}) {
  const points = validatePairs(rawPoints);
  const n = points.length;
  let { vmax, km } = initialGuess(points);

  const sse = (vm, k) => {
    let total = 0;
    for (const { s, v } of points) {
      const pred = (vm * s) / (k + s);
      const r = v - pred;
      total += r * r;
    }
    return total;
  };

  let lambda = 1e-3;
  let err = sse(vmax, km);

  for (let iter = 0; iter < 120; iter++) {
    // 2x2 Gauss-Newton Jacobian^T * Jacobian and gradient
    let j00 = 0;
    let j01 = 0;
    let j11 = 0;
    let g0 = 0;
    let g1 = 0;
    for (const { s, v } of points) {
      const denom = km + s;
      const pred = (vmax * s) / denom;
      const res = v - pred;
      const dVmax = s / denom;
      const dKm = (-vmax * s) / (denom * denom);
      j00 += dVmax * dVmax;
      j01 += dVmax * dKm;
      j11 += dKm * dKm;
      g0 += dVmax * res;
      g1 += dKm * res;
    }
    const a00 = j00 + lambda * Math.max(j00, 1e-12);
    const a11 = j11 + lambda * Math.max(j11, 1e-12);
    const det = a00 * a11 - j01 * j01;
    if (Math.abs(det) < 1e-30) break;

    const dVm = (a11 * g0 - j01 * g1) / det;
    const dKm = (a00 * g1 - j01 * g0) / det;
    const nextVm = Math.max(vmax + dVm, 1e-15);
    const nextKm = Math.max(km + dKm, 1e-15);
    const nextErr = sse(nextVm, nextKm);

    if (nextErr < err) {
      const rel = Math.abs(err - nextErr) / Math.max(err, 1e-18);
      vmax = nextVm;
      km = nextKm;
      err = nextErr;
      lambda = Math.max(lambda * 0.3, 1e-9);
      if (rel < 1e-11 && Math.abs(dVm) < 1e-10 && Math.abs(dKm) < 1e-10) break;
    } else {
      lambda = Math.min(lambda * 5, 1e9);
      if (lambda >= 1e9) break;
    }
  }

  // Goodness-of-fit & asymptotic standard errors from (J^T J)^-1 * s^2
  const meanV = points.reduce((acc, p) => acc + p.v, 0) / n;
  const sst = points.reduce((acc, p) => acc + (p.v - meanV) ** 2, 0);
  const r2 = sst > 0 ? 1 - err / sst : 1;
  const dof = Math.max(n - 2, 1);
  const s2 = err / dof;

  let j00 = 0;
  let j01 = 0;
  let j11 = 0;
  for (const { s } of points) {
    const denom = km + s;
    const dVmax = s / denom;
    const dKm = (-vmax * s) / (denom * denom);
    j00 += dVmax * dVmax;
    j01 += dVmax * dKm;
    j11 += dKm * dKm;
  }
  const det = j00 * j11 - j01 * j01;
  const seVmax = det > 1e-30 ? Math.sqrt(Math.max((j11 / det) * s2, 0)) : NaN;
  const seKm = det > 1e-30 ? Math.sqrt(Math.max((j00 / det) * s2, 0)) : NaN;

  const residuals = points.map((p) => {
    const fitted = (vmax * p.s) / (km + p.s);
    return { s: p.s, v: p.v, fitted, residual: p.v - fitted };
  });

  const lineweaverBurk = points
    .filter((p) => p.s > 0 && p.v > 0)
    .map((p) => ({ invS: 1 / p.s, invV: 1 / p.v }));

  // Optional kcat & catalytic efficiency
  let kcat = null;
  let catalyticEfficiency = null;
  if (opts.enzymeConcM != null && opts.enzymeConcM !== '') {
    const enz = Number(opts.enzymeConcM);
    requirePositive(enz, 'enzymeConcM');
    const sFactor = opts.substrateToMolar ?? 1e-3;
    const vFactor = opts.rateToMolarPerSec ?? 1e-3;
    requirePositive(sFactor, 'substrateToMolar');
    requirePositive(vFactor, 'rateToMolarPerSec');
    kcat = (vmax * vFactor) / enz;
    const kmMolar = km * sFactor;
    catalyticEfficiency = kcat / kmMolar;
  }

  return {
    vmax,
    km,
    seVmax,
    seKm,
    r2,
    rmse: Math.sqrt(err / n),
    kcat,
    catalyticEfficiency,
    residuals,
    lineweaverBurk,
    n,
  };
}

/**
 * Evaluate fitted Michaelis–Menten curve on a dense grid for plotting.
 */
export function michaelisMentenCurve({ vmax, km, maxS, steps = 80 }) {
  requirePositive(vmax, 'vmax');
  requirePositive(km, 'km');
  requirePositive(maxS, 'maxS');
  const count = Math.max(10, Math.min(Math.round(steps), 400));
  const out = [];
  for (let i = 0; i <= count; i++) {
    const s = (maxS * i) / count;
    out.push({ s, v: (vmax * s) / (km + s) });
  }
  return out;
}

/**
 * Extract initial reaction rates (dA/dt) from microplate / spectrophotometer
 * time-course series, with optional multi-blank subtraction.
 *
 * @param {object} params
 * @param {number[]} params.times  Time points (e.g. seconds or minutes)
 * @param {Array<{name: string, values: number[], role?: 'sample'|'blank'}>} params.series
 * @param {number} [params.pathLengthCm=1]
 * @param {number} [params.extinctionCoeff=0]  M^-1 cm^-1; when > 0, also returns rate in uM/unit-time
 */
export function batchInitialRates({ times, series, pathLengthCm = 1, extinctionCoeff = 0 }) {
  if (!Array.isArray(times) || times.length < 2) {
    fail('kineticsNeedTwoTimes', { count: Array.isArray(times) ? times.length : 0 });
  }
  const cleanT = times.map((t, idx) => {
    const num = Number(t);
    requireFinite(num, `time[${idx + 1}]`);
    return num;
  });
  if (!Array.isArray(series) || series.length === 0) {
    fail('kineticsNeedSeries', {});
  }
  requirePositive(pathLengthCm, 'pathLengthCm');

  const n = cleanT.length;
  const mt = cleanT.reduce((a, b) => a + b, 0) / n;
  let stt = 0;
  for (let i = 0; i < n; i++) stt += (cleanT[i] - mt) ** 2;
  if (stt <= 1e-24) fail('kineticsFlatTimes', {});

  const fitSlope = (vals, label) => {
    if (!Array.isArray(vals) || vals.length !== n) {
      fail('kineticsLengthMismatch', { name: label, expected: n, actual: vals?.length ?? 0 });
    }
    const nums = vals.map((v, idx) => {
      const num = Number(v);
      requireFinite(num, `${label}[${idx + 1}]`);
      return num;
    });
    const my = nums.reduce((a, b) => a + b, 0) / n;
    let sty = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      sty += (cleanT[i] - mt) * (nums[i] - my);
      syy += (nums[i] - my) ** 2;
    }
    const slope = sty / stt;
    const intercept = my - slope * mt;
    const ssRes = nums.reduce((acc, y, i) => acc + (y - (slope * cleanT[i] + intercept)) ** 2, 0);
    const r2 = syy > 1e-24 ? 1 - ssRes / syy : 1;
    return { slope, intercept, r2 };
  };

  const blanks = series.filter((s) => s.role === 'blank');
  let blankSlope = 0;
  if (blanks.length > 0) {
    const bSlopes = blanks.map((b) => fitSlope(b.values, b.name || 'blank').slope);
    blankSlope = bSlopes.reduce((a, b) => a + b, 0) / bSlopes.length;
  }

  const samples = series.filter((s) => s.role !== 'blank').map((s) => {
    const fit = fitSlope(s.values, s.name || 'sample');
    const netSlope = fit.slope - blankSlope;
    const rateMicromolarPerUnit = extinctionCoeff > 0
      ? (netSlope / (extinctionCoeff * pathLengthCm)) * 1e6
      : null;
    return {
      name: s.name || 'Sample',
      rawSlope: fit.slope,
      netSlope,
      r2: fit.r2,
      rateMicromolarPerUnit,
    };
  });

  return {
    blankSlope,
    blankCount: blanks.length,
    samples,
  };
}
