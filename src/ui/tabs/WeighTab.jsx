import React, { useState, useMemo, useEffect } from 'react';
import { stockFromSolid, molarMass } from '../../calc/solution.mjs';
import { TextField, NumField, Result, Err } from '../components/Fields.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

export default function WeighTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [formula, setFormula] = useState(restored?.formula ?? 'NaCl');
  const [molarity, setMolarity] = useState(restored?.molarity != null ? String(restored.molarity) : '0.5');
  const [volume, setVolume] = useState(restored?.volumeMl != null ? String(restored.volumeMl) : '500');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  const M = useMemo(() => {
    try { return molarMass(formula); } catch { return null; }
  }, [formula]);

  useEffect(() => { setOut(null); setErr(null); }, [formula, molarity, volume]);

  function run() {
    try {
      const inputs = { formula, molarity: n(molarity), volumeMl: n(volume) };
      const r = stockFromSolid(inputs);
      setOut(r);
      setErr(null);
      onRecord({
        kind: 'stockFromSolid',
        inputs,
        outputs: r,
        summary: recordSummary({ kind: 'stockFromSolid', inputs, outputs: r }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  return (
    <div className="card">
      <TextField
        label={t('common.formula')} value={formula} onChange={setFormula}
        placeholder={t('common.formulaPlaceholder')}
        hint={M
          ? `${t('common.molarMass')} ${M.toFixed(3)} g/mol`
          : t('common.formulaPlaceholder')}
        error={formula && !M ? t('common.formulaUnparseable') : null}
      />
      <div className="row">
        <NumField label={t('weigh.targetMolarity')} value={molarity} onChange={setMolarity} min="0" />
        <NumField label={t('weigh.finalVolume')} value={volume} onChange={setVolume} min="0" />
      </div>
      <button className="primary" onClick={run} disabled={!M}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}
      <Result
        value={out ? fmtSci(out.massG, 3) : null}
        unit={t('weigh.unit')}
        note={out ? t('weigh.note', { volume: out.finalVolumeMl }) : null}
        rows={out ? [
          [t('common.molarMass'), `${fmt(out.molarMass, 3)} g/mol`],
          [t('weigh.amount'), `${fmtSci(out.moles, 4)} mol`],
          [t('weigh.finalVolume'), `${out.finalVolumeMl} mL`],
        ] : null}
      />
    </div>
  );
}
