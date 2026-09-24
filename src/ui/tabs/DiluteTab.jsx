import React, { useState, useEffect } from 'react';
import { dilution } from '../../calc/solution.mjs';
import { NumField, Result, Err } from '../components/Fields.jsx';
import { fmt, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

export default function DiluteTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [stock, setStock] = useState(restored?.stockConc != null ? String(restored.stockConc) : '1');
  const [target, setTarget] = useState(restored?.targetConc != null ? String(restored.targetConc) : '0.1');
  const [volume, setVolume] = useState(restored?.targetVolumeMl != null ? String(restored.targetVolumeMl) : '100');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

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
    <div className="card">
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
      />
    </div>
  );
}
