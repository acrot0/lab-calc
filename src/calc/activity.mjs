import {
  activityCoefficient, ionicStrength, withinDaviesRange,
} from './reagent.mjs';
import { fail, requireFinite, requireNonNegative, requirePositive } from './errors.mjs';

/**
 * The corrections that turn an ideal-solution model into a real one.
 *
 * Every other calculation in this app answers "what would happen if the ions
 * did not interact". That is the textbook first approximation, and for a
 * teaching calculator it is a defensible one — but it is also the single
 * largest error in the results, and the disclaimer has said so since the first
 * release. This module is where that stops being true.
 *
 * Three things are corrected, and they compound:
 *
 * 1. **Activity, not concentration.** A pH electrode responds to the *activity*
 *    of H⁺, not its concentration. In a 0.1 M buffer the two differ by 22%,
 *    which is a pH shift of a tenth — larger than the tolerance of most bench
 *    work.
 * 2. **Ionic strength, not just the species of interest.** The ions in the
 *    solution shield each other, and the shielding depends on every ion
 *    present, weighted by charge squared. A buffer's pH therefore depends on
 *    how much salt is in it, which is why two recipes with the same acid:base
 *    ratio do not read the same.
 * 3. **Temperature.** pKa is a thermodynamic quantity and moves with
 *    temperature. For Tris it moves a lot: 0.028 pH units per degree, so a
 *    buffer made at 25 °C and used in a 4 °C cold room is 0.6 pH units off —
 *    the entire useful range of the buffer.
 *
 * All three are computed from published parameters rather than fitted here.
 * The Davies equation's range limit is enforced by the caller, not hidden: past
 * I ≈ 0.5 M the fit is extrapolating and the number is not to be trusted.
 *
 * ## Why separate functions rather than options
 *
 * `weakAcidPh` stays as it is — the ideal case — and the corrected version is
 * a separate function. A flag on the existing one would mean every existing
 * caller silently acquires a new code path, and the ideal answer would no
 * longer be reachable from the same name. Two names, two models, and a caller
 * that has to say which one it wants.
 */

/** The gas constant in kJ/(mol·K), to match the enthalpies tables are quoted in. */
const R_KJ = 0.008314;

/** 2.303 converts a natural-log relation to a base-10 one. */
const LN10 = Math.LN10;

/** Absolute zero in °C, as a number rather than a magic value in a check. */
const ABSOLUTE_ZERO_C = -273.15;

/** The reference temperature every tabulated pKa is quoted at. */
export const PKA_REFERENCE_C = 25;
const PKA_REFERENCE_K = PKA_REFERENCE_C - ABSOLUTE_ZERO_C;

/**
 * Enthalpies of ionization for the buffers this app offers as presets.
 *
 * Without these the temperature correction cannot be applied to anything: ΔH is
 * the number that says how far a pKa moves, and it is not derivable from the
 * pKa. The values are the standard calorimetric ones, in kJ/mol.
 *
 * The variation in magnitude is the point of including Tris. Every other entry
 * here is a weak acid whose pKa barely notices the temperature; Tris moves by
 * more than a tenth of a unit over a 25 → 20 °C room-temperature drift, and by
 * 0.63 units between a 25 °C bench and a 4 °C cold room. A buffer table that
 * lists one number per buffer is a table that is wrong about Tris by more than
 * its own useful range.
 *
 * `test/activity.test.mjs` checks each entry's implied `dpKa/dT` against the
 * published value, because a ΔH typed with the wrong sign is invisible in the
 * data and changes every answer.
 */
export const PKA_ENTHALPY = {
  acetate: { pKa25: 4.76, deltaH: -0.41, acidCharge: 0, baseCharge: -1 },
  // Carbonic acid's first pKa. The second (10.33) is not offered: a carbonate
  // buffer at pH 10 is a buffer at the edge of what water allows.
  carbonate: { pKa25: 6.35, deltaH: -9.0, acidCharge: 0, baseCharge: -1 },
  // Phosphoric acid's first pKa. See `phosphate2` for the second, which is the
  // one buffers are actually made from.
  phosphate: { pKa25: 2.15, deltaH: -8.0, acidCharge: 0, baseCharge: -1 },
  // The workhorse: pKa₂, the H₂PO₄⁻/HPO₄²⁻ pair. It is listed second because a
  // picker sorted by pKa would otherwise put the useless one first.
  phosphate2: { pKa25: 7.20, deltaH: -8.0, acidCharge: -1, baseCharge: -2 },
  // Tris is a base, and this is the pKa of its conjugate acid at 25 °C. The
  // large negative ΔH — unusual for an amine — comes from the proton landing
  // on a hydroxyl-substituted nitrogen.
  tris: { pKa25: 8.06, deltaH: -47.7, acidCharge: 1, baseCharge: 0 },
  ammonia: { pKa25: 9.25, deltaH: -52.2, acidCharge: 1, baseCharge: 0 },
  pyridine: { pKa25: 5.23, deltaH: -28.0, acidCharge: 1, baseCharge: 0 },
  hepes: { pKa25: 7.55, deltaH: -21.0, acidCharge: 0, baseCharge: -1 },
  mes: { pKa25: 6.10, deltaH: -14.0, acidCharge: 0, baseCharge: -1 },
  citrate: { pKa25: 6.40, deltaH: -5.0, acidCharge: -1, baseCharge: -2 },
  borate: { pKa25: 9.24, deltaH: -13.0, acidCharge: 0, baseCharge: -1 },
};

/**
 * The enthalpy table as a list a picker can render.
 *
 * `kind` is which of the two pH-tab modes works this buffer, and the rule is
 * chemical rather than numerical: a buffer is worked as a **base** when its
 * deprotonated form is neutral — an amine, where what you weigh out is the
 * base — and as an **acid** otherwise. That covers the anionic acids too:
 * NaH₂PO₄ and sodium citrate are dissolved as their acid form and give an
 * acidic solution, so they belong on the acid side even though neither the
 * acid nor the base form is neutral.
 *
 * Sorting by pKa would put pyridine (5.23) with the carboxylic acids, which is
 * the wrong half of the tab: what you pipette is pyridine, a base.
 *
 * `presetPk` is the number to put in a pKa/pKb field: for a base, the app asks
 * for pKb, which is 14 − pKa.
 */
export const BUFFER_PRESETS = Object.entries(PKA_ENTHALPY).map(([name, v]) => {
  const isBase = v.baseCharge === 0;
  return {
    name,
    pKa25: v.pKa25,
    deltaH: v.deltaH,
    acidCharge: v.acidCharge,
    baseCharge: v.baseCharge,
    kind: isBase ? 'base' : 'acid',
    presetPk: isBase ? 14 - v.pKa25 : v.pKa25,
  };
});

/** The preset with this name, or undefined. */
export const bufferPreset = (name) => BUFFER_PRESETS.find((p) => p.name === name);

/**
 * A pKa at a temperature other than 25 °C, by the van 't Hoff relation.
 *
 *   pKa(T) = pKa(25) − (ΔH / 2.303·R) · (1/T − 1/298.15)
 *
 * This is the integrated form, and it assumes ΔH is constant over the range —
 * the same approximation every buffer table makes when it lists a single
 * `dpKa/dT`. It is good to a few hundredths over the 0–40 °C range this app is
 * used in, and it is not valid in an autoclave.
 *
 * ## The sign, which is the whole content of this function
 *
 * `ΔH = 2.303·R·T²·(dpKa/dT)`. The two quantities have the *same* sign, so an
 * exothermic ionization (ΔH < 0) has its pKa **fall** as temperature rises.
 * Getting this backwards is not a small error: for Tris it is 0.63 pH units in
 * the wrong direction, which would make a cold-room buffer look correct when it
 * is not.
 *
 * The two cases that matter at the bench run opposite ways. Acetic acid is
 * slightly exothermic (ΔH ≈ −0.41 kJ/mol, −0.0002 pH/°C) so its pKa barely
 * moves. Tris is strongly exothermic in the same sense (ΔH ≈ −47.7 kJ/mol,
 * −0.028 pH/°C) because its amine is protonated and the charge is buried on
 * protonation — so a Tris buffer made at 25 °C and used at 4 °C is 0.63 units
 * more alkaline than its recipe says, which is the entire useful range of the
 * buffer and then some.
 *
 * @param {number} pKa25  pKa at 25 °C
 * @param {number} deltaH Enthalpy of ionization in kJ/mol
 * @param {number} tempC  The temperature to correct to
 */
export function pKaAt({ pKa25, deltaH, tempC }) {
  requireFinite(pKa25, 'pKa');
  requireFinite(deltaH, 'deltaH');
  requireFinite(tempC, 'temperature');
  if (tempC <= ABSOLUTE_ZERO_C) fail('temperatureBelowAbsoluteZero', { tempC });
  const T = tempC - ABSOLUTE_ZERO_C;
  return pKa25 - (deltaH / (LN10 * R_KJ)) * (1 / T - 1 / PKA_REFERENCE_K);
}

/**
 * The activity of a species of the given charge at the given ionic strength —
 * or its concentration, for a neutral one.
 *
 * A neutral molecule has no ion atmosphere to be shielded by, so its activity
 * coefficient is 1 by definition. `activityCoefficient` already returns 1 for
 * charge 0, but going through it would mean every buffer calculation has to
 * know that; this makes the neutral case explicit at the call site.
 */
export function gammaFor(charge, I) {
  if (charge === 0) return 1;
  return activityCoefficient({ ionicStrength: I, charge });
}

/**
 * pH of a monoprotic acid, corrected for ionic strength.
 *
 * For HA^z ⇌ H⁺ + A^(z−1) with Ka = a(H⁺)·a(A)/a(HA):
 *
 *   Ka = γ_H·γ_A·x² / (γ_HA·(C − x))
 *
 * which is a quadratic in x. The pH is then `−log₁₀(γ_H·x)` — the activity,
 * not the concentration, because that is what the electrode responds to.
 *
 * ## The neutral case barely moves, and that is not a bug
 *
 * For an uncharged acid (z = 0, the common case: acetic, formic, lactic) the
 * acid form has γ = 1 and the other two are both singly charged, so γ_H = γ_A.
 * Then x scales as 1/γ_H and the pH as `−log(γ_H·x)` — the two cancel, leaving
 * a residual of only a thousandth of a unit:
 *
 * | I (mol/L) | γ± | pH of 0.1 M acetic |
 * |---|---|---|
 * | 0 | 1.000 | 2.8829 |
 * | 0.1 | 0.781 | 2.8837 |
 * | 0.5 | 0.733 | 2.8839 |
 *
 * So the ideal model is not wrong for a weak acid, and this function will
 * confirm that rather than manufacture a correction. What it fixes is the
 * *charged* acids — dihydrogen phosphate (z = −1), ammonium (z = +1), the
 * protonated form of any basic drug — where γ_A and γ_HA differ and the shift
 * is real: phosphate's pKa₂ solution moves by 0.11 pH units between I = 0 and
 * I = 0.1.
 *
 * Reporting the same number the ideal model gives is the honest answer here.
 * A module that "corrected" acetic acid by 0.05 would be worse than useless:
 * it would teach a wrong mechanism.
 *
 * ## The ionic strength when none is given
 *
 * For an acid alone in water the ionic strength is not an input — it is
 * produced by the dissociation. For a neutral acid, [H⁺] = [A⁻] = x, so
 * charge balance gives I = x. For a charged one the same holds once the
 * counter-ion is accounted for: the species carry z and z−1, and at these
 * concentrations the autoionisation of water is irrelevant.
 *
 * Pass `ionicStrength` when the acid sits in a background salt (a buffer, a
 * physiological medium, a mobile phase) — there I is set by the other ions.
 *
 * @param {number} pKa
 * @param {number} conc            Formal concentration of the acid
 * @param {number} [charge]        Charge of the acid form; 0 for HA
 * @param {number} [ionicStrength] Background I; omitted means "solve for it"
 */
export function weakAcidPhActivity({ pKa, conc, charge = 0, ionicStrength: given }) {
  requireFinite(pKa, 'pKa');
  requirePositive(conc, 'concentration');
  requireFinite(charge, 'charge');
  if (!Number.isInteger(charge)) fail('chargeNotInteger', { charge });

  const solve = (I) => ({
    x: hydrogenIonConc({ pKa, conc, charge, I }),
    gammaH: gammaFor(1, I),
    gammaAcid: gammaFor(charge, I),
    gammaBase: gammaFor(charge - 1, I),
  });

  if (given !== undefined && given !== null) {
    requireFinite(given, 'ionicStrength');
    const s = solve(given);
    return finish(s, given);
  }

  /*
   * Fixed point on I. Four passes: each moves I by a factor of γ, and γ is
   * within 4% of 1 for any acid dilute enough that its own dissociation sets
   * the ionic strength. A fifth would be below double precision.
   *
   * Charge balance for a neutral acid gives I = x exactly. For a charged one
   * the proton and the conjugate base are the only ions, at x each with
   * charges 1 and z−1, so I = ½(x·1 + x·(z−1)²) — which for z = −1 is
   * ½(1 + 4)x = 2.5x, and that is what the iteration uses.
   */
  const fromX = (x, z) => 0.5 * (x + x * (z - 1) ** 2);
  let I = 0;
  let s = solve(0);
  for (let i = 0; i < 4; i++) {
    s = solve(I);
    I = fromX(s.x, charge);
  }
  return finish(s, I);
}

/** Assemble the returned shape, with the pH read off the corrected activity. */
function finish(s, I) {
  return {
    ph: -Math.log10(s.gammaH * s.x),
    concH: s.x,
    gammaH: s.gammaH,
    gammaAcid: s.gammaAcid,
    gammaBase: s.gammaBase,
    ionicStrength: I,
    inDaviesRange: withinDaviesRange(I),
  };
}

/** The positive root of γ_H·γ_A·x² + Ka·γ_HA·x − Ka·γ_HA·C = 0. */
function hydrogenIonConc({ pKa, conc, charge, I }) {
  const ka = 10 ** -pKa;
  const a = gammaFor(1, I) * gammaFor(charge - 1, I);
  const b = ka * gammaFor(charge, I);
  return (-b + Math.sqrt(b ** 2 + 4 * a * b * conc)) / (2 * a);
}

/**
 * Henderson–Hasselbalch with activities in place of concentrations.
 *
 *   pH = pKa + log₁₀( a(A⁻) / a(HA) )
 *      = pKa + log₁₀( γ_A·[A⁻] / (γ_HA·[HA]) )
 *
 * The charges are parameters because the same equation covers both directions:
 * an acid buffer's conjugate base is charged and its acid is neutral, while a
 * base buffer (ammonia/ammonium) is the reverse. Neutral species have γ = 1, so
 * only the charged side is corrected — which is exactly why an acid buffer is
 * shifted down and a base buffer up.
 *
 * At I = 0 this reduces to the plain equation. It is not a different model, it
 * is the same one with the terms that are usually dropped put back.
 *
 * @param {number} pKa
 * @param {number} acidConc      Formal concentration of the acid form
 * @param {number} baseConc      Formal concentration of the base form
 * @param {number} [ionicStrength]
 * @param {number} [acidCharge]  Charge of the acid form (default 0, e.g. HA)
 * @param {number} [baseCharge]  Charge of the base form (default −1, e.g. A⁻)
 */
export function hendersonHasselbalchActivity({
  pKa, acidConc, baseConc, ionicStrength: I = 0, acidCharge = 0, baseCharge = -1,
}) {
  requireFinite(pKa, 'pKa');
  requirePositive(acidConc, 'acidConc');
  requirePositive(baseConc, 'baseConc');
  requireFinite(I, 'ionicStrength');
  const gAcid = gammaFor(acidCharge, I);
  const gBase = gammaFor(baseCharge, I);
  const ratio = (gBase * baseConc) / (gAcid * acidConc);
  return {
    ph: pKa + Math.log10(ratio),
    ratio,
    gammaAcid: gAcid,
    gammaBase: gBase,
    ionicStrength: I,
    // The shift the ideal model omits. Negative for an acid buffer, positive
    // for a base buffer, and reported rather than left to be inferred from two
    // numbers that differ by a tenth.
    shift: Math.log10(gBase / gAcid),
    inDaviesRange: withinDaviesRange(I),
  };
}

/**
 * The ionic strength a buffer recipe produces, from the salts in it.
 *
 * A buffer is not only its acid and base: the counter-ion that came with the
 * conjugate base is in the beaker too, and at 0.1 M it is the largest
 * contributor. Given the recipe's species, this is the I the corrected pH
 * should be computed at — which is the number a user would otherwise have to
 * work out by hand from a table.
 */
export function ionicStrengthOf({ ions }) {
  const I = ionicStrength(ions);
  return { ionicStrength: I, inDaviesRange: withinDaviesRange(I) };
}

/**
 * A complete buffer, with every correction applied and every intermediate
 * visible.
 *
 * This is the whole point of the module in one function: a user gives the
 * buffer's identity, its concentration and the temperature it will be used at,
 * and gets back the pH it will actually read — plus the four numbers that
 * explain the difference from the textbook answer.
 *
 * ## Where the ionic strength comes from
 *
 * Not from a parameter the user has to work out. A solution is electrically
 * neutral, so the counter-ions are whatever balances the buffer's own charged
 * species — and that is determined by the recipe:
 *
 * | buffer | species at pH | counter-ion |
 * |---|---|---|
 * | acetate 0.1 M, pH 5 | 0.064 A⁻ | 0.064 Na⁺ |
 * | phosphate 0.1 M, pH 7.2 | 0.05 H₂PO₄⁻ + 0.05 HPO₄²⁻ | 0.15 Na⁺ |
 * | Tris 0.05 M, pH 8 | 0.027 TrisH⁺ | 0.027 Cl⁻ |
 *
 * The counter-ion is not a detail — for phosphate it is the *largest* single
 * contributor to I, and a calculation that omits it understates the ionic
 * strength by a factor of 1.6 and the pH shift with it. It is derived rather
 * than asked for because the user does not know it: they know they weighed out
 * Na₂HPO₄.
 *
 * ## The order the corrections are applied in, and why it matters
 *
 * 1. **Temperature first**, on the pKa. ΔH is a property of the buffer, and
 *    the pKa at the working temperature is what everything downstream uses.
 *    Applying it after the ratio would mean solving for a ratio at the wrong
 *    pKa and then correcting — which does not give the same answer, because
 *    the ratio is exponential in the pKa.
 * 2. **Then the ionic strength**, from the recipe's own ions.
 * 3. **Then the activity correction**, on the ratio.
 *
 * ## What is deliberately not modelled
 *
 * I ignores the acid's own dissociation (small next to a 0.1 M buffer), the
 * autoionisation of water, and any ions the user did not mention. That is why
 * the result carries `ionicStrength` as a number rather than hiding it: a user
 * who knows their buffer is also 0.15 M in NaCl can put that in and see I
 * move.
 *
 * The Davies range limit is reported, not enforced by throwing. Past I ≈ 0.5 M
 * the number is an extrapolation, and the caller decides what to do about it.
 *
 * @param {number} pKa25       pKa at 25 °C
 * @param {number} [deltaH]    Enthalpy of ionization, kJ/mol; 0 = no correction
 * @param {number} [tempC]     Working temperature; defaults to 25
 * @param {number} targetPh    The pH the recipe is written for
 * @param {number} totalConc   Total buffer concentration (acid + base)
 * @param {number} [backgroundSalt] Concentration of an added 1:1 salt
 * @param {number} [acidCharge] Charge of the acid form
 * @param {number} [baseCharge] Charge of the base form
 */
export function correctedBuffer({
  pKa25, deltaH = 0, tempC = PKA_REFERENCE_C, targetPh, totalConc,
  backgroundSalt = 0, acidCharge = 0, baseCharge = -1,
}) {
  requireFinite(pKa25, 'pKa');
  requireFinite(deltaH, 'deltaH');
  requireFinite(targetPh, 'targetPh');
  requirePositive(totalConc, 'totalConc');
  requireNonNegative(backgroundSalt, 'backgroundSalt');
  for (const [name, z] of [['acidCharge', acidCharge], ['baseCharge', baseCharge]]) {
    if (!Number.isInteger(z)) fail('chargeNotInteger', { charge: z });
    void name;
  }

  const pKa = pKaAt({ pKa25, deltaH, tempC });

  /*
   * The ratio the recipe calls for, from the target pH — at the working
   * temperature's pKa, which is the correction that matters most.
   */
  const ratio = 10 ** (targetPh - pKa);
  const baseConc = totalConc * (ratio / (1 + ratio));
  const acidConc = totalConc - baseConc;

  const ions = [
    { conc: acidConc, charge: acidCharge },
    { conc: baseConc, charge: baseCharge },
  ];

  /*
   * The counter-ion, from electroneutrality. The buffer's own species carry a
   * net charge; a real solution has none, so an equal and opposite amount of
   * the titrant's ion is present. Which one depends on the sign: a anionic
   * buffer comes with Na⁺, a cationic one with Cl⁻.
   */
  const netCharge = acidConc * acidCharge + baseConc * baseCharge;
  if (netCharge !== 0) ions.push({ conc: Math.abs(netCharge), charge: -Math.sign(netCharge) });

  // A 1:1 background salt contributes its own concentration to I:
  // ½(c·1² + c·1²) = c.
  if (backgroundSalt > 0) {
    ions.push({ conc: backgroundSalt, charge: 1 }, { conc: backgroundSalt, charge: -1 });
  }

  const { ionicStrength: I } = ionicStrengthOf({ ions });
  const corrected = hendersonHasselbalchActivity({
    pKa, acidConc, baseConc, ionicStrength: I, acidCharge, baseCharge,
  });

  return {
    pKa25,
    pKa,
    pKaShift: pKa - pKa25,
    tempC,
    ratio,
    acidConc,
    baseConc,
    totalConc,
    ionicStrength: I,
    ph: corrected.ph,
    gammaAcid: corrected.gammaAcid,
    gammaBase: corrected.gammaBase,
    activityShift: corrected.shift,
    // What the recipe's own arithmetic says, with neither correction — the
    // number that was on the label. Reported so the difference is visible
    // rather than merely asserted.
    idealPh: pKa25 + Math.log10(ratio),
    inDaviesRange: corrected.inDaviesRange,
  };
}
