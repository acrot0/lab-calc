import React, { useState, useEffect } from 'react';
import { dilutionSeries } from '../../calc/buffer.mjs';
import { NumField, Err } from '../components/Fields.jsx';
import DilutionDiagram from '../components/diagrams/DilutionDiagram.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

export default function SeriesTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [stock, setStock] = useState(restored?.stockConc != null ? String(restored.stockConc) : '1000');
  const [factor, setFactor] = useState(restored?.factor != null ? String(restored.factor) : '10');
  const [steps, setSteps] = useState(restored?.steps != null ? String(restored.steps) : '5');
  const [vol, setVol] = useState(restored?.stepVolumeMl != null ? String(restored.stepVolumeMl) : '100');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);
  const [showDiagram, setShowDiagram] = useState(false);

  useEffect(() => { setOut(null); setErr(null); }, [stock, factor, steps, vol]);

  function run() {
    try {
      const inputs = { stockConc: n(stock), factor: n(factor), steps: n(steps), stepVolumeMl: n(vol) };
      const r = dilutionSeries(inputs);
      setOut(r);
      setErr(null);
      onRecord({
        kind: 'dilutionSeries', inputs, outputs: { series: r },
        summary: recordSummary({ kind: 'dilutionSeries', inputs, outputs: { series: r } }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  return (
    <div className="card">
      <div className="row">
        <NumField label={t('series.stockConc')} value={stock} onChange={setStock} min="0" />
        <NumField label={t('series.factor')} value={factor} onChange={setFactor} min="1" hint={t('series.factorHint')} />
      </div>
      <div className="row">
        <NumField label={t('series.steps')} value={steps} onChange={setSteps} min="1" step="1" />
        <NumField label={t('series.stepVolume')} value={vol} onChange={setVol} min="0" />
      </div>
      <div className="row row-actions">
        <button className="primary" onClick={run}>{t('common.calc')}</button>
        <button className="link-btn" onClick={() => setShowDiagram((v) => !v)}>
          {showDiagram ? t('diagram.hide') : t('diagram.show')}
        </button>
      </div>
      {/* Driven by the fields above rather than by the result, so the shape can
          be explored before committing to a calculation. */}
      {showDiagram && (
        <DilutionDiagram factor={n(factor)} steps={n(steps)} />
      )}
      {err && <Err>{err}</Err>}
      {out && (
        <div className="result">
          {/* The note carries inline markup, so it is rendered as HTML rather
              than as a translated string with an <em> baked into it. */}
          <div className="result-note">
            {t('series.note').split(/<\/?em>/).map((part, i) => (i === 1 ? <em key={i}>{part}</em> : part))}
          </div>
          <table className="series-table">
            <thead>
              <tr>
                <th scope="col">{t('series.colTube')}</th>
                <th scope="col">{t('series.colConc')}</th>
                <th scope="col">{t('series.colSource')}</th>
                <th scope="col">{t('series.colTake')}</th>
                <th scope="col">{t('series.colDiluent')}</th>
              </tr>
            </thead>
            <tbody>
              {out.map((s) => (
                <tr key={s.step}>
                  <th scope="row">{s.step}</th>
                  {/* A 1:100 series reaches 1e-16 by tube 8, and fmt would
                      render that as 0 — a row claiming no solute at all. */}
                  <td>{fmtSci(s.conc, 4)}</td>
                  <td>{s.step === 1 ? t('series.stock') : t('series.fromTube', { n: s.step - 1 })}</td>
                  <td>{fmt(s.stockVolumeMl, 2)} mL</td>
                  <td>{fmt(s.diluentVolumeMl, 2)} mL</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
