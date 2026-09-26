import React, { useState, useEffect, useMemo } from 'react';
import { bufferRecipe } from '../../calc/buffer.mjs';
import { BUFFER_PRESETS, PKA_REFERENCE_C, bufferPreset, correctedBuffer } from '../../calc/activity.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import BufferDiagram from '../components/diagrams/BufferDiagram.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';

export default function BufferTab({ onRecord, restored, theme = 'dark' }) {
  const { t } = useI18n();
  const [preset, setPreset] = useState(restored?.preset ?? '');
  const [pka, setPka] = useState(restored?.pKa != null ? String(restored.pKa) : '4.76');
  const [ph, setPh] = useState(restored?.targetPh != null ? String(restored.targetPh) : '5.0');
  const [total, setTotal] = useState(restored?.totalConc != null ? String(restored.totalConc) : '0.1');
  const [tempC, setTempC] = useState(restored?.tempC != null ? String(restored.tempC) : String(PKA_REFERENCE_C));
  const [salt, setSalt] = useState(restored?.backgroundSalt != null ? String(restored.backgroundSalt) : '0');
  const [out, setOut] = useState(null);
  const [real, setReal] = useState(null);
  const [err, setErr] = useState(null);
  const [showDiagram, setShowDiagram] = useState(false);

  /*
   * Loading a preset sets the pKa and the temperature parameters together.
   *
   * ΔH and the two charges are not derivable from a pKa, and a buffer whose
   * name is known but whose ΔH is not is a buffer whose temperature correction
   * cannot be computed. Picking from this list is what makes the correction
   * available at all; typing a pKa by hand still works and simply gets the
   * ideal model with the activity correction, which is what a pKa alone
   * supports.
   */
  const chosen = bufferPreset(preset);

  function applyPreset(name) {
    setPreset(name);
    const p = bufferPreset(name);
    if (!p) return;
    setPka(String(p.pKa25));
  }

  // The temperature correction needs a ΔH; without a preset there is none, and
  // the field is disabled rather than silently ignored.
  const tempUsable = Boolean(chosen);

  // Henderson-Hasselbalch rearranged for the ratio, then the ratio applied to
  // the total concentration — the two steps the equation hides.
  const worked = useMemo(() => {
    if (!out) return null;
    const ratio = out.ratio;
    return [
      { term: 'pH', value: t('common.worked_Henderson') },
      {
        term: t('buffer.ratioUnit'),
        value: t('common.worked_RatioStep', {
          ph: fmt(n(ph), 4), pka: fmt(out.pKa, 4), ratio: fmt(ratio, 4),
        }),
      },
      {
        term: t('buffer.totalConc'),
        value: t('common.worked_ConcStep', {
          total: fmtSci(n(total), 4),
          acid: fmtSci(out.acidConc, 4),
          base: fmtSci(out.baseConc, 4),
        }),
      },
    ];
  }, [out, ph, total, t]);

  useEffect(() => { setOut(null); setReal(null); setErr(null); }, [preset, pka, ph, total, tempC, salt]);

  function run() {
    try {
      const inputs = {
        pKa: n(pka), targetPh: n(ph), totalConc: n(total),
        tempC: n(tempC), backgroundSalt: n(salt),
      };
      const r = bufferRecipe(inputs);
      setOut(r);
      setErr(null);
      onRecord({
        kind: 'bufferRecipe', inputs, outputs: r,
        summary: recordSummary({ kind: 'bufferRecipe', inputs, outputs: r }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  /*
   * The corrected model runs alongside the ideal one rather than replacing it.
   *
   * Both answers are shown because the difference is the point: a user who sees
   * "5.00 by the recipe, 4.91 as it will read" has learned something a single
   * number cannot tell them. It runs on the same effect as nothing else — it
   * does not need the Calculate button, because it is a model evaluation rather
   * than a record-worthy calculation, and requiring a press to see it would
   * make the ideal number look like the answer.
   */
  useEffect(() => {
    const pKa25 = n(pka);
    const targetPh = n(ph);
    const totalConc = n(total);
    if (![pKa25, targetPh, totalConc].every(Number.isFinite) || totalConc <= 0) {
      setReal(null);
      return;
    }
    try {
      setReal(correctedBuffer({
        pKa25,
        deltaH: chosen?.deltaH ?? 0,
        tempC: tempUsable ? n(tempC) : PKA_REFERENCE_C,
        targetPh,
        totalConc,
        backgroundSalt: Math.max(0, n(salt) || 0),
        acidCharge: chosen?.acidCharge ?? 0,
        baseCharge: chosen?.baseCharge ?? -1,
      }));
    } catch {
      setReal(null);
    }
  }, [pka, ph, total, tempC, salt, chosen, tempUsable]);

  return (
    <Card>
      <div className="field">
        <label htmlFor="buffer-preset">{t('buffer.preset')}</label>
        <select id="buffer-preset" value={preset} onChange={(e) => applyPreset(e.target.value)}>
          <option value="">{t('buffer.presetCustom')}</option>
          {BUFFER_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>
              {`${t(`buffer.preset_${p.name}`)} — pKa ${p.pKa25}`}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <NumField label={t('buffer.pka')} value={pka} onChange={setPka} hint={t('buffer.pkaHint')} />
        <NumField label={t('buffer.targetPh')} value={ph} onChange={setPh} />
      </div>
      <NumField label={t('buffer.totalConc')} value={total} onChange={setTotal} min="0" hint={t('buffer.totalConcHint')} />

      {/* The two fields that turn the ideal answer into the real one. Both are
          inert without a preset, because ΔH and the charges are what a preset
          carries and a bare pKa does not. */}
      <div className="row">
        <NumField
          label={t('buffer.tempC')}
          value={tempUsable ? tempC : String(PKA_REFERENCE_C)}
          onChange={setTempC}
          hint={tempUsable ? t('buffer.tempHint') : t('buffer.tempNeedsPreset')}
          disabled={!tempUsable}
        />
        <NumField label={t('buffer.backgroundSalt')} value={salt} onChange={setSalt} min="0"
          hint={t('buffer.saltHint')} />
      </div>

      <div className="row row-actions">
        <button className="primary" onClick={run}>{t('common.calc')}</button>
        {/* Collapsed by default. The diagram explains the equation, which is
            worth reading once — not on every visit, and not while typing a
            number into the field above it. */}
        <button className="link-btn" onClick={() => setShowDiagram((v) => !v)}>
          {showDiagram ? t('diagram.hide') : t('diagram.show')}
        </button>
      </div>
      {showDiagram && <BufferDiagram pka={n(pka) || 4.76} theme={theme} />}
      {err && <Err>{err}</Err>}
      {out && !out.inRange && <Warn>{t('buffer.warning')}</Warn>}

      {real && !real.inDaviesRange && <Warn>{t('buffer.tooSalty')}</Warn>}

      <Result
        value={out ? fmt(out.ratio, 3) : null}
        unit={t('buffer.ratioUnit')}
        note={out ? t('buffer.equation', { pka: fmt(out.pKa, 2), log: fmt(Math.log10(out.ratio), 3) }) : null}
        rows={out ? [
          [t('buffer.acid'), `${fmtSci(out.acidConc, 4)} mol/L`],
          [t('buffer.base'), `${fmtSci(out.baseConc, 4)} mol/L`],
          [t('buffer.range'), out.inRange ? t('buffer.inRange') : t('buffer.outOfRange')],
        ] : null}
        worked={worked}
        workedLabel={t('common.worked')}
      />

      {/* The corrected reading, in its own result block so the two numbers sit
          side by side rather than one replacing the other. */}
      {real && (
        <Result
          value={fmt(real.ph, 3)}
          unit="pH"
          note={t('buffer.realNote', {
            ideal: fmt(real.idealPh, 2),
            temp: fmt(real.tempC, 0),
          })}
          rows={[
            [t('buffer.pkaAtTemp'), fmt(real.pKa, 3)],
            [t('buffer.tempShift'), `${real.pKaShift >= 0 ? '+' : ''}${fmt(real.pKaShift, 3)}`],
            [t('buffer.ionicStrength'), `${fmtSci(real.ionicStrength, 4)} mol/L`],
            [t('buffer.gammaAcid'), fmt(real.gammaAcid, 3)],
            [t('buffer.gammaBase'), fmt(real.gammaBase, 3)],
            [t('buffer.activityShift'), `${real.activityShift >= 0 ? '+' : ''}${fmt(real.activityShift, 3)}`],
            [t('buffer.idealPh'), fmt(real.idealPh, 3)],
          ]}
          worked={[
            { term: t('buffer.pkaAtTemp'), value: t('common.worked_VantHoff', { pka25: fmt(real.pKa25, 3), pka: fmt(real.pKa, 3), temp: fmt(real.tempC, 0) }) },
            { term: t('buffer.ionicStrength'), value: t('common.worked_IonicStep', { I: fmtSci(real.ionicStrength, 4) }) },
            { term: t('buffer.activityShift'), value: t('common.worked_ActivityStep', { gamma: fmt(real.gammaBase, 3), shift: fmt(real.activityShift, 3) }) },
          ]}
          workedLabel={t('common.worked')}
        />
      )}
    </Card>
  );
}
