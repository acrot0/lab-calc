import React, { useState, useEffect, useMemo } from 'react';
import { weakAcidPh, weakBasePh } from '../../calc/titration.mjs';
import { weakAcidPhActivity, BUFFER_PRESETS } from '../../calc/activity.mjs';
import { speciationCurve } from '../../calc/curve.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import SpeciationPlot from '../components/SpeciationPlot.jsx';
import { fmt, fmtSci, n, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';

/**
 * The common lab acids and bases, taken from the buffer table.
 *
 * Shared rather than re-listed, because the two tabs need the same facts and a
 * second list would drift from the first. What this tab adds over a bare pKa is
 * the **charge of the acid form**, which the activity correction needs and a
 * pKa alone does not carry — so a locally-written preset list would have had to
 * invent a field the other table already holds.
 *
 * `presetPk` is the number the field wants: pKa for an acid, pKb for a base,
 * which the table already computes as `14 − pKa`.
 *
 * The list is wider than the six this tab used to offer. That is deliberate:
 * Tris-HCl and HEPES are the charged cases where the correction actually moves
 * the answer, and leaving them out would keep the new row showing zero.
 */
const PRESETS = BUFFER_PRESETS;

export default function PhTab({ onRecord, restored, theme = 'dark' }) {
  const { t } = useI18n();
  const [kind, setKind] = useState(restored?.kind ?? 'acid');
  const [pk, setPk] = useState(restored?.pk != null ? String(restored.pk) : '4.76');
  const [conc, setConc] = useState(restored?.conc != null ? String(restored.conc) : '0.1');
  /*
   * The charge of the acid form, and the background ionic strength.
   *
   * Both are needed for the activity correction and neither is derivable from a
   * pKa, so both default to the values that make the correction vanish: charge
   * 0 and I 0 give back the ideal answer exactly. A user who does not know what
   * they are gets the number the tab always gave.
   *
   * The charge follows the preset rather than being typed, because it is a
   * property of the substance and not of the experiment. Choosing a preset sets
   * it; typing a pKa by hand leaves it at neutral, which is the common case.
   */
  const [charge, setCharge] = useState(restored?.charge ?? 0);
  const [salt, setSalt] = useState(restored?.salt != null ? String(restored.salt) : '0');
  /*
   * The preset the current pK came from, or null once it is typed by hand.
   *
   * Tracked so the select can show what is loaded, and so a later edit to the
   * pK field clears it — a preset name sitting above a number that no longer
   * matches it would be a label that lies.
   */
  const [chosen, setChosen] = useState(
    () => BUFFER_PRESETS.find((p) => p.name === restored?.preset) ?? null,
  );
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);
  const [showCurve, setShowCurve] = useState(false);

  /*
   * Loading a preset writes all three fields at once.
   *
   * The pK and the charge belong to the substance, so choosing one from the
   * list has to set both — leaving the charge behind would silently correct
   * with the previous substance's charge, which is a wrong answer that looks
   * deliberate.
   */
  function applyPreset(name) {
    const p = BUFFER_PRESETS.find((x) => x.name === name);
    if (!p) {
      setChosen(null);
      return;
    }
    setKind(p.kind);
    setPk(String(p.presetPk));
    setCharge(p.kind === 'acid' ? p.acidCharge : 0);
    setChosen(p);
  }

  useEffect(() => { setOut(null); setErr(null); }, [kind, pk, conc]);

  /*
   * The distribution behind the approximation this tab uses.
   *
   * Built from the pKa alone and computed whether or not the chart is open —
   * it is a model evaluation, not a recorded calculation, so it does not need
   * the Calculate button. For a base the tab is given pKb, and the pKa the
   * distribution is drawn against is that of the conjugate acid.
   *
   * Only the acid direction is drawn. The base case is the same picture
   * mirrored about pH = pKa, and drawing it would need a second axis to say so
   * honestly — a labelled mirror is worse than a link that explains it.
   */
  const speciation = useMemo(() => {
    if (kind !== 'acid') return null;
    const pKa = n(pk);
    if (!Number.isFinite(pKa) || pKa <= 0 || pKa >= 14) return null;
    try {
      return speciationCurve({ pKa });
    } catch {
      return null;
    }
  }, [kind, pk]);

  /*
   * The ideal answer, recorded on demand.
   *
   * The recorded value is the ideal one rather than the corrected one: the
   * history is a log of what was calculated, and the ideal model is what the
   * Calculate button computes. The corrected reading is a model evaluation
   * shown beside it, and it is the same number on every render — logging it
   * would put two rows in the history for one press.
   */
  function run() {
    try {
      const inputs = {
        kind, pk: n(pk), conc: n(conc), charge, salt: Math.max(0, n(salt) || 0),
      };
      const ph = kind === 'acid'
        ? weakAcidPh({ pKa: inputs.pk, conc: inputs.conc })
        : weakBasePh({ pKb: inputs.pk, conc: inputs.conc });
      const r = { ph, pOH: 14 - ph, ...inputs };
      setOut(r);
      setErr(null);
      onRecord({
        kind: 'phCalc', inputs, outputs: { ph },
        summary: recordSummary({ kind: 'phCalc', inputs, outputs: { ph } }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  /*
   * The corrected model, run alongside the ideal one rather than replacing it.
   *
   * Same contract as the buffer tab's: it does not wait for the Calculate
   * button, because it is a model evaluation and not a record-worthy
   * calculation, and gating it behind a press would make the ideal number look
   * like the answer. Both are shown, because the difference is the point.
   *
   * ## What the correction is, and where it is not
   *
   * The electrode responds to activity, not concentration, so pH is
   * `−log₁₀(γ_H·[H⁺])`. For a **neutral** acid the acid form has γ = 1 and the
   * proton and conjugate base are both singly charged, so the two γ terms
   * cancel and the ideal answer is right to about a thousandth of a unit —
   * acetic acid moves 0.004 pH units between I = 0 and I = 0.1. Manufacturing a
   * correction there would teach a wrong mechanism, so the row reports the
   * small number it actually is.
   *
   * What moves is the **charged** acid: dihydrogen phosphate (z = −1),
   * ammonium and Tris-HCl (z = +1), citrate (z = −1). There γ_A and γ_HA differ
   * and the shift is real — measured, 0.107 pH units at I = 0.1, peaking around
   * 0.134 at I = 0.5.
   *
   * The base direction reuses the acid function with `pKa := pKb`, which is the
   * same algebra with OH⁻ in the proton's role, and `charge := 0` because a
   * neutral base's acid form is the cation — and for a neutral base the same
   * cancellation applies, so the answer barely moves either. `14 − pOH` is the
   * pH. This is not an approximation of the base case; it is the base case.
   */
  const real = useMemo(() => {
    const pkValue = n(pk);
    const concValue = n(conc);
    const saltValue = Math.max(0, n(salt) || 0);
    if (![pkValue, concValue].every(Number.isFinite) || concValue <= 0) return null;
    if (!Number.isFinite(pkValue) || pkValue <= 0) return null;
    const isAcid = kind === 'acid';
    try {
      const ideal = isAcid
        ? weakAcidPh({ pKa: pkValue, conc: concValue })
        : weakBasePh({ pKb: pkValue, conc: concValue });
      /*
       * A base is corrected as its conjugate acid, and the two are the same
       * equation: for B + H₂O ⇌ BH⁺ + OH⁻ the roles of H⁺ and OH⁻ swap, so the
       * acid routine applied to pKb returns the corrected **pOH**.
       *
       * The charge is the acid form's. A neutral base — ammonia, pyridine, the
       * amines — has a cation for its acid form, but the cancellation above
       * means a neutral *acid* form and a charged one are different questions:
       * here the species that stays neutral is B, and γ_B = 1, so the terms
       * cancel exactly as they do for acetic acid. Passing z = 0 is what
       * encodes that. Passing the cation's +1 would over-correct by 0.10.
       */
      const a = weakAcidPhActivity({
        // The same pK either way: for a base the tab is given pKb, and the
        // routine is being asked for the pOH, so pKb is the number it wants.
        pKa: pkValue,
        conc: concValue,
        charge: isAcid ? charge : 0,
        ionicStrength: saltValue,
      });
      const correctedPh = isAcid ? a.ph : 14 - a.ph;
      return {
        idealPh: ideal,
        ph: correctedPh,
        shift: correctedPh - ideal,
        gammaH: a.gammaH,
        gammaAcid: a.gammaAcid,
        gammaBase: a.gammaBase,
        ionicStrength: a.ionicStrength,
        inDaviesRange: a.inDaviesRange,
        concH: a.concH,
      };
    } catch {
      return null;
    }
  }, [kind, pk, conc, charge, salt]);

  // Gate the result on the acid/base kind that produced it — the reset effect
  // runs after render, so a kind switch would otherwise show the previous
  // direction's number under the new direction's label for one frame.
  const shown = shownFor(out, 'kind', kind);

  // The approximation the tab is built on, shown rather than assumed.
  //
  // The calc layer returns pH alone, so the intermediate quantities are
  // recomputed here from the same inputs. That is a second copy of the
  // arithmetic, which is normally worth avoiding — but these are the two
  // definitions the result rests on (Ka = 10^-pKa and [H+] = sqrt(Ka·C)), not
  // a reimplementation of the answer, and showing them is the entire point of
  // this panel.
  const worked = useMemo(() => {
    if (!shown) return null;
    const pkValue = Number(shown.pk);
    const concValue = Number(shown.conc);
    const isAcid = shown.kind === 'acid';
    // For a base the tab is given pKb, and Ka of the conjugate acid is Kw/Kb.
    const ka = isAcid ? 10 ** -pkValue : 1e-14 / (10 ** -pkValue);
    const h = Math.sqrt(ka * concValue);
    return [
      {
        term: isAcid ? 'pKa' : 'pKb',
        value: t('common.worked_WeakAcid'),
        detail: `Ka = 10^(−pK)`,
      },
      {
        term: 'Ka',
        value: t('common.worked_WeakAcidStep', {
          pka: fmtSci(pkValue, 4), ka: fmtSci(ka, 4), conc: fmtSci(concValue, 4), h: fmtSci(h, 4),
        }),
      },
      {
        term: 'pH',
        value: t('common.worked_PhStep', { h: fmtSci(h, 4), ph: fmt(shown.ph, 4) }),
      },
    ];
  }, [shown, t]);


  return (
    <Card>
      <div className="field">
        <label htmlFor="ph-kind">{t('ph.kind')}</label>
        <select id="ph-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="acid">{t('ph.acidOption')}</option>
          <option value="base">{t('ph.baseOption')}</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="ph-preset">{t('ph.preset')}</label>
        <select
          id="ph-preset"
          value={chosen?.name ?? ''}
          onChange={(e) => applyPreset(e.target.value)}
        >
          <option value="">{t('ph.presetCustom')}</option>
          {PRESETS.filter((p) => p.kind === kind).map((p) => (
            <option key={p.name} value={p.name}>
              {/* Rounded: `14 − pKa` is exact in binary for some entries and
                  not others, so Tris rendered as "pKb 5.9399999999999995" —
                  a label carrying fifteen digits of a subtraction artefact. */}
              {`${t(`buffer.preset_${p.name}`)} — ${kind === 'acid' ? 'pKa' : 'pKb'} ${fmt(p.presetPk, 2)}`}
            </option>
          ))}
        </select>
      </div>

      <NumField
        label={kind === 'acid' ? t('ph.pka') : t('ph.pkb')}
        value={pk}
        onChange={(v) => { setPk(v); setChosen(null); }}
        hint={t('ph.pkaHint')}
      />
      <NumField label={t('ph.conc')} value={conc} onChange={setConc} min="0" />

      {/* The two fields the activity correction needs and a pKa does not carry.
          Both are inert on their own: at charge 0 and I 0 the corrected answer
          is the ideal one, which is the honest default for a user who does not
          know the ionic strength of their solution. */}
      <div className="row">
        <div className="field">
          <label htmlFor="ph-charge">{t('ph.charge')}</label>
          <select
            id="ph-charge"
            value={charge}
            onChange={(e) => setCharge(Number(e.target.value))}
          >
            <option value={0}>{t('ph.charge0')}</option>
            <option value={-1}>{t('ph.chargeMinus1')}</option>
            <option value={1}>{t('ph.chargePlus1')}</option>
          </select>
        </div>
        <NumField
          label={t('ph.salt')}
          value={salt}
          onChange={setSalt}
          min="0"
          hint={t('ph.saltHint')}
        />
      </div>

      <div className="row row-actions">
        <button className="primary" onClick={run}>{t('common.calc')}</button>
        {/* Collapsed by default, for the reason the buffer diagram is: it
            explains the formula, which is worth reading once, not on every
            visit and not while typing into the field above it. */}
        {speciation && (
          <button className="link-btn" onClick={() => setShowCurve((v) => !v)}>
            {showCurve ? t('diagram.hide') : t('ph.showSpeciation')}
          </button>
        )}
      </div>
      {showCurve && speciation && (
        <SpeciationPlot
          curve={speciation}
          currentPh={shown ? shown.ph : null}
          theme={theme}
        />
      )}
      {err && <Err>{err}</Err>}

      <Warn>{t('ph.warning')}</Warn>

      <Result
        value={shown ? fmt(shown.ph, 2) : null}
        unit="pH"
        note={shown ? t('ph.note', {
          kind: shown.kind === 'acid' ? t('ph.weakAcid') : t('ph.weakBase'),
          pk: shown.pk,
        }) : null}
        rows={shown ? [
          ['pH', fmt(shown.ph, 3)],
          ['pOH', fmt(shown.pOH, 3)],
          [t('common.concentration'), `${shown.conc} mol/L`],
        ] : null}
        worked={worked}
        workedLabel={t('common.worked')}
      />

      {/* The activity-corrected reading, in its own block so the two numbers sit
          side by side rather than one replacing the other — same shape as the
          buffer tab, for the same reason. */}
      {real && (
        <Result
          value={fmt(real.ph, 3)}
          unit="pH"
          note={t('ph.realNote', {
            ideal: fmt(real.idealPh, 2),
            gamma: fmt(real.gammaH, 3),
          })}
          rows={[
            [t('ph.ionicStrength'), `${fmtSci(real.ionicStrength, 4)} mol/L`],
            [t('ph.gammaH'), fmt(real.gammaH, 3)],
            [t('ph.gammaAcid'), fmt(real.gammaAcid, 3)],
            [t('ph.gammaBase'), fmt(real.gammaBase, 3)],
            [t('ph.activityShift'), `${real.shift >= 0 ? '+' : ''}${fmt(real.shift, 3)}`],
            [t('ph.idealPh'), fmt(real.idealPh, 3)],
          ]}
          worked={[
            {
              term: t('ph.ionicStrength'),
              value: t('common.worked_IonicStep', { I: fmtSci(real.ionicStrength, 4) }),
            },
            {
              term: t('ph.gammaH'),
              value: t('common.worked_ActivityPhStep', { gamma: fmt(real.gammaH, 3), shift: fmt(real.shift, 3) }),
            },
          ]}
          workedLabel={t('common.worked')}
        />
      )}

      {/* The Davies equation is only valid to about I = 0.5, and past it the
          correction turns over and starts moving the wrong way — at I = 2 the
          model returns a smaller shift than at I = 1. Saying so beats letting a
          number from an out-of-range model read as a measurement. */}
      {real && !real.inDaviesRange && <Warn>{t('ph.outOfRange')}</Warn>}
    </Card>
  );
}
