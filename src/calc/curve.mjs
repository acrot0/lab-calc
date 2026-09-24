/**
 * Weak acid / strong base titration curve.
 *
 * Why the exact treatment instead of the sqrt(Ka·C) approximation used
 * elsewhere: that approximation assumes the acid is barely dissociated, which
 * is true at the start of a titration and catastrophically false near the
 * equivalence point. The curve exists precisely to show that region, so it has
 * to solve the equilibrium properly.
 *
 * The model solves, at each added titrant volume, the charge balance:
 *
 *   [Na+] + [H+] = [OH-] + [A-]
 *
 * with [A-] = C_acid · Ka / (Ka + [H+]), which is exact for a monoprotic weak
 * acid. Rearranged into a polynomial in [H+] and solved by bisection — slower
 * than a closed form but numerically robust across the whole curve, including
 * the steep part where a closed form loses precision.
 */

const requirePositive = (v, name) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new Error(`${name}必须大于 0（当前为 ${v}）`);
  }
};

export const KW = 1e-14;

/** Derive the working parameters of a weak-acid titration. */
export function weakAcidCurveParams({ pKa, conc, volumeMl }) {
  if (typeof pKa !== 'number' || !Number.isFinite(pKa)) {
    throw new Error('pKa 必须是有效数字');
  }
  requirePositive(conc, '浓度');
  requirePositive(volumeMl, '体积');
  return {
    ka: 10 ** -pKa,
    pKa,
    conc,
    volumeMl,
    molesAnalyte: conc * (volumeMl / 1000),
  };
}

/**
 * Solve for [H+] at a given point in the titration by bisection.
 *
 * f is the charge-balance residual:
 *
 *   f([H+]) = [Na+] + [H+] - [OH-] - [A-]
 *
 * It is monotonically INCREASING in [H+]: more free protons means more
 * positive charge that the other terms must offset. Verified numerically —
 * f(1e-15) ≈ -10 and f(1) ≈ +1.1 at the equivalence point of a 0.1 M acetic
 * acid titration. An earlier version assumed it decreased and bracketed the
 * wrong way, which converged confidently on a pH of 16.
 *
 * Bracket is [1e-15, 1] M, i.e. pH 15 down to pH 0 — wider than any titration
 * curve reaches. Bisection on the geometric midpoint because pH is a log scale,
 * so this converges in pH rather than in concentration.
 */
function solveH({ ka, molesAnalyte, molesTitrant, totalVolumeL }) {
  const cAcid = molesAnalyte / totalVolumeL;
  const cBase = molesTitrant / totalVolumeL;

  const f = (h) => {
    const aMinus = (cAcid * ka) / (ka + h);
    const ohMinus = KW / h;
    return cBase + h - ohMinus - aMinus;
  };

  let lo = 1e-15; // f(lo) < 0
  let hi = 1.0;   // f(hi) > 0
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/** Volume of titrant at the equivalence point, and the pH there. */
export function findEquivalencePoint({ pKa, conc, volumeMl, titrantConc }) {
  const p = weakAcidCurveParams({ pKa, conc, volumeMl });
  requirePositive(titrantConc, '滴定液浓度');
  const volumeEqMl = (p.molesAnalyte / titrantConc) * 1000;
  const ph = phAt(p, p.molesAnalyte, volumeMl + volumeEqMl);
  return { volumeMl: volumeEqMl, ph };
}

/** pH after adding `molesTitrant` to the analyte, given total volume in mL. */
function phAt(p, molesTitrant, totalVolumeMl) {
  const h = solveH({
    ka: p.ka,
    molesAnalyte: p.molesAnalyte,
    molesTitrant,
    totalVolumeL: totalVolumeMl / 1000,
  });
  return -Math.log10(h);
}

/**
 * The full curve, sampled evenly in titrant volume from 0 to `overshoot`× the
 * equivalence volume.
 *
 * Sampling evenly in volume (not pH) is deliberate: a real burette adds volume
 * at a constant rate, so the x-axis is what the person at the bench controls.
 */
export function titrationCurve({
  pKa, conc, volumeMl, titrantConc, points = 120, overshoot = 1.8,
}) {
  const p = weakAcidCurveParams({ pKa, conc, volumeMl });
  requirePositive(titrantConc, '滴定液浓度');
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error(`采样点数必须是正整数（当前为 ${points}）`);
  }
  requirePositive(overshoot, '过量倍数');

  const volumeEqMl = (p.molesAnalyte / titrantConc) * 1000;
  const maxVolumeMl = volumeEqMl * overshoot;

  const out = [];
  for (let i = 0; i < points; i++) {
    const v = (maxVolumeMl * i) / (points - 1);
    const molesTitrant = titrantConc * (v / 1000);
    out.push({
      volumeMl: v,
      ph: phAt(p, molesTitrant, volumeMl + v),
    });
  }
  return out;
}
