import React, { useState, useMemo, useEffect } from 'react';
import { stockFromSolid, molarMass, molarMassBreakdown } from '../../calc/solution.mjs';
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

  // The specific reason is kept, not just "it failed": "subscript cannot be
  // zero" tells the user what to fix, and a bare "unparseable" does not. The
  // error carries a code, so it is translated rather than shown raw.
  const parsed = useMemo(() => {
    try { return { mass: molarMass(formula), error: null }; } catch (e) {
      return { mass: null, error: formula.trim() ? errorMessage(e, t) : null };
    }
  }, [formula, t]);
  const M = parsed.mass;

  // The derivation, rebuilt whenever the formula or the inputs change. Kept
  // next to the result rather than in the calc layer, because what counts as
  // a step worth showing is a presentation decision.
  const worked = useMemo(() => {
    if (!M || !out) return null;
    const { terms, total } = molarMassBreakdown(formula);
    const volumeL = out.finalVolumeMl / 1000;
    return [
      {
        term: t('common.formula'),
        value: formula,
        detail: t('common.molarMass'),
      },
      {
        term: t('common.worked_MolarMass'),
        detail: t('common.worked_FormulaMass', { formula }),
      },
      ...terms.map((tm) => ({
        term: '',
        value: tm.count === 1
          ? t('common.worked_TermSingle', {
            element: tm.element, atomic: fmt(tm.atomic, 4),
          })
          : t('common.worked_Term', {
            element: tm.element,
            atomic: fmt(tm.atomic, 4),
            count: tm.count,
            contribution: fmt(tm.contribution, 4),
          }),
      })),
      { term: '', value: t('common.worked_Total', { total: fmt(total, 4) }) },
      {
        term: t('weigh.amount'),
        value: t('common.worked_Moles', {
          conc: fmtSci(n(molarity), 4),
          volume: fmt(volumeL, 4),
          moles: fmtSci(out.moles, 4),
        }),
      },
      {
        term: t('weigh.unit'),
        value: t('common.worked_Mass', {
          moles: fmtSci(out.moles, 4),
          molarMass: fmt(out.molarMass, 4),
          mass: fmtSci(out.massG, 4),
        }),
      },
    ];
  }, [formula, M, out, molarity, t]);

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
        error={parsed.error}
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
        worked={worked}
        workedLabel={t('common.worked')}
      />
    </div>
  );
}
