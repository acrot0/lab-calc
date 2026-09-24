import React, { useState, useEffect } from 'react';
import {
  colligative, osmoticPressure, molarMassFromFreezingPoint, SOLVENTS, DILUTE_LIMIT,
} from '../../calc/colligative.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, n, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

/**
 * Colligative properties: boiling point, freezing point, osmotic pressure, and
 * the reverse direction — molar mass of an unknown from the melting point drop.
 *
 * The van 't Hoff factor is a first-class input rather than a hidden default of
 * 1, because using 1 for a salt halves the predicted effect and the number
 * still looks reasonable.
 */
const MODES = ['shift', 'osmotic', 'unknown'];

/** Common solutes, with the factor each one dissociates to. */
const SOLUTES = [
  { label: 'NaCl', i: 2 },
  { label: 'KCl', i: 2 },
  { label: 'CaCl₂', i: 3 },
  { label: 'MgSO₄', i: 2 },
  { label: '葡萄糖 glucose', i: 1 },
  { label: '蔗糖 sucrose', i: 1 },
  { label: '尿素 urea', i: 1 },
];

export default function ColligativeTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'shift');
  const [solvent, setSolvent] = useState(restored?.solvent ?? 'water');
  const [molality, setMolality] = useState(restored?.molality != null ? String(restored.molality) : '0.5');
  const [iFactor, setIFactor] = useState(restored?.i != null ? String(restored.i) : '1');
  const [molarity, setMolarity] = useState(restored?.molarity != null ? String(restored.molarity) : '0.15');
  const [tempC, setTempC] = useState(restored?.tempC != null ? String(restored.tempC) : '25');
  const [deltaTf, setDeltaTf] = useState(restored?.deltaTf != null ? String(restored.deltaTf) : '1.28');
  const [massG, setMassG] = useState(restored?.massG != null ? String(restored.massG) : '1');
  const [solventKg, setSolventKg] = useState(restored?.solventKg != null ? String(restored.solventKg) : '0.02');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setOut(null); setErr(null);
  }, [mode, solvent, molality, iFactor, molarity, tempC, deltaTf, massG, solventKg]);

  function run() {
    try {
      let inputs;
      let r;
      if (mode === 'shift') {
        inputs = { mode, solvent, molality: n(molality), i: n(iFactor) };
        r = colligative(inputs);
      } else if (mode === 'osmotic') {
        inputs = { mode, molarity: n(molarity), i: n(iFactor), tempC: n(tempC) };
        r = osmoticPressure(inputs);
      } else {
        inputs = { mode, solvent, deltaTf: n(deltaTf), massG: n(massG), solventKg: n(solventKg), i: n(iFactor) };
        r = molarMassFromFreezingPoint(inputs);
      }
      setOut({ mode, ...r });
      setErr(null);
      onRecord({ kind: 'colligative', inputs, outputs: r, summary: recordSummary({ kind: 'colligative', inputs, outputs: r }, t) });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  const shown = shownFor(out, 'mode', mode);
  const solventName = t(`colligative.solvent_${solvent}`);

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="coll-mode">{t('colligative.mode')}</label>
        <select id="coll-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => <option key={m} value={m}>{t(`colligative.mode_${m}`)}</option>)}
        </select>
      </div>

      {mode !== 'osmotic' && (
        <div className="field">
          <label htmlFor="coll-solvent">{t('colligative.solvent')}</label>
          <select id="coll-solvent" value={solvent} onChange={(e) => setSolvent(e.target.value)}>
            {Object.keys(SOLVENTS).map((k) => <option key={k} value={k}>{t(`colligative.solvent_${k}`)}</option>)}
          </select>
        </div>
      )}

      {mode === 'shift' && (
        <NumField label={t('colligative.molality')} value={molality} onChange={setMolality} min="0"
          hint={t('colligative.molalityHint')} />
      )}

      {mode === 'osmotic' && (
        <div className="row">
          <NumField label={t('colligative.molarity')} value={molarity} onChange={setMolarity} min="0" />
          <NumField label={t('colligative.tempC')} value={tempC} onChange={setTempC} hint={t('colligative.tempCHint')} />
        </div>
      )}

      {mode === 'unknown' && (
        <>
          <div className="row">
            <NumField label={t('colligative.deltaTf')} value={deltaTf} onChange={setDeltaTf} min="0"
              hint={t('colligative.deltaTfHint')} />
            <NumField label={t('colligative.solventMass')} value={solventKg} onChange={setSolventKg} min="0" />
          </div>
          <NumField label={t('colligative.soluteMass')} value={massG} onChange={setMassG} min="0" />
        </>
      )}

      <div className="stock-chips">
        {SOLUTES.map((s) => (
          <button key={s.label} className="chip" onClick={() => setIFactor(String(s.i))}>
            {s.label} · i = {s.i}
          </button>
        ))}
      </div>
      <NumField label={t('colligative.iFactor')} value={iFactor} onChange={setIFactor} min="0"
        hint={t('colligative.iFactorHint')} />

      <button className="primary" onClick={run} style={{ marginTop: 'var(--s4)' }}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}

      {shown?.mode === 'shift' && (
        <Result value={fmt(shown.deltaTf, 4)} unit="K"
          note={t('colligative.shiftNote', { solvent: solventName, kf: shown.kf, kb: shown.kb })}
          rows={[
            [t('colligative.boilingPoint'), `${fmt(shown.boilingPoint, 3)} °C`],
            [t('colligative.freezingPoint'), `${fmt(shown.freezingPoint, 3)} °C`],
            [t('colligative.deltaTb'), `${fmt(shown.deltaTb, 4)} K`],
            [t('colligative.deltaTf'), `${fmt(shown.deltaTf, 4)} K`],
          ]} />
      )}
      {shown?.mode === 'shift' && shown.diluteWarning && (
        <Warn>{errorMessage(shown.diluteWarning, t)}</Warn>
      )}
      {shown?.mode === 'shift' && !shown.diluteWarning && (
        <Warn>{t('colligative.diluteNote', { limit: DILUTE_LIMIT })}</Warn>
      )}

      {shown?.mode === 'osmotic' && (
        <Result value={fmt(shown.atm, 4)} unit="atm"
          note={t('colligative.osmoticNote', { osmolarity: fmt(shown.osmolarity, 4), tempK: fmt(shown.tempK, 2) })}
          rows={[
            [t('colligative.kPa'), `${fmt(shown.kPa, 3)} kPa`],
            [t('colligative.osmolarity'), `${fmt(shown.osmolarity, 4)} osmol/L`],
          ]} />
      )}

      {shown?.mode === 'unknown' && (
        <Result value={fmt(shown.molarMass, 3)} unit="g/mol"
          note={t('colligative.unknownNote', { kf: fmt(shown.kf, 2), solvent: solventName })}
          rows={[
            [t('colligative.molality'), `${fmt(shown.molality, 5)} mol/kg`],
            [t('colligative.moles'), `${fmt(shown.moles, 6)} mol`],
          ]} />
      )}
    </div>
  );
}
