import React, { useState, useEffect, useMemo } from 'react';
import { dilution } from '../../calc/solution.mjs';
import { NumField, Result, Err } from '../components/Fields.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';

export default function DiluteTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [stock, setStock] = useState(restored?.stockConc != null ? String(restored.stockConc) : '1');
  const [target, setTarget] = useState(restored?.targetConc != null ? String(restored.targetConc) : '0.1');
  const [volume, setVolume] = useState(restored?.targetVolumeMl != null ? String(restored.targetVolumeMl) : '100');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  // The derivation behind the result: C1V1 = C2V2, then the diluent as the
  // difference, then the factor — the order someone would do it by hand.
  const worked = useMemo(() => {
    if (!out) return null;
    const c1 = n(stock);
    const c2 = n(target);
    const v2 = n(volume);
    return [
      { term: t('dilute.fold'), value: t('common.worked_Dilution') },
      {
        term: '',
        value: t('common.worked_DilutionStep', {
          c2: fmtSci(c2, 4), v2: fmt(v2, 4), c1: fmtSci(c1, 4), v1: fmt(out.stockVolumeMl, 4),
        }),
      },
      {
        term: t('dilute.diluentVolume'),
        value: t('common.worked_DiluentStep', {
          v2: fmt(v2, 4), v1: fmt(out.stockVolumeMl, 4), diluent: fmt(out.diluentVolumeMl, 4),
        }),
      },
      ...(out.foldDilution
        ? [{
          term: t('dilute.fold'),
          value: t('common.worked_FoldStep', {
            c1: fmtSci(c1, 4), c2: fmtSci(c2, 4), fold: fmt(out.foldDilution, 4),
          }),
        }]
        : []),
    ];
  }, [out, stock, target, volume, t]);

  useEffect(() => { setOut(null); setErr(null); }, [stock, target, volume]);

  function run() {
    try {
      const inputs = { stockConc: n(stock), targetConc: n(target), targetVolumeMl: n(volume) };
      const r = dilution(inputs);
      setOut(r);
      setErr(null);
      onRecord({
        kind: 'dilution', inputs, outputs: r,
        summary: recordSummary({ kind: 'dilution', inputs, outputs: r }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  return (
    <Card>
      <div className="row">
        <NumField label={t('dilute.stockConc')} value={stock} onChange={setStock} min="0" />
        <NumField label={t('dilute.targetConc')} value={target} onChange={setTarget} min="0" />
      </div>
      <NumField label={t('dilute.targetVolume')} value={volume} onChange={setVolume} min="0" />
      <button className="primary" onClick={run}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}
      <Result
        value={out ? fmt(out.stockVolumeMl, 2) : null}
        unit={t('dilute.unit')}
        note={out ? t('dilute.note', { diluent: fmt(out.diluentVolumeMl, 2), volume: fmt(n(volume), 1) }) : null}
        rows={out ? [
          [t('dilute.stockVolume'), `${fmt(out.stockVolumeMl, 3)} mL`],
          [t('dilute.diluentVolume'), `${fmt(out.diluentVolumeMl, 3)} mL`],
          [t('dilute.fold'), out.foldDilution ? `${fmt(out.foldDilution, 2)}×` : '—'],
        ] : null}
        worked={worked}
        workedLabel={t('common.worked')}
      />
    </Card>
  );
}
