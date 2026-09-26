import React, { useState, useEffect, useMemo } from 'react';
import { dilutionSeries } from '../../calc/buffer.mjs';
import { NumField, Err, Worked } from '../components/Fields.jsx';
import DilutionDiagram from '../components/diagrams/DilutionDiagram.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';

export default function SeriesTab({ onRecord, restored, theme = 'dark' }) {
  const { t } = useI18n();
  const [stock, setStock] = useState(restored?.stockConc != null ? String(restored.stockConc) : '1000');
  const [factor, setFactor] = useState(restored?.factor != null ? String(restored.factor) : '10');
  const [steps, setSteps] = useState(restored?.steps != null ? String(restored.steps) : '5');
  const [vol, setVol] = useState(restored?.stepVolumeMl != null ? String(restored.stepVolumeMl) : '100');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);
  const [showDiagram, setShowDiagram] = useState(false);

  /*
   * The series, shown as the recurrence it is.
   *
   * A table of tubes answers "what do I pipette", but not "why is tube 5 that
   * number" — the answer is that each tube divides the previous one by the
   * factor, and the last tube is the stock divided by factor^steps. Both are
   * written out here so the pattern is visible rather than inferred.
   */
  const worked = useMemo(() => {
    if (!out || out.length === 0) return null;
    const f = n(factor);
    const first = out[0];
    const last = out[out.length - 1];
    return [
      { term: t('common.worked_SeriesFold'), value: '' },
      {
        term: t('series.colTube') + ' 1',
        value: t('common.worked_SeriesStep', {
          stock: fmtSci(n(stock), 4),
          factor: fmtSci(f, 4),
          c1: fmtSci(first.conc, 4),
          take: fmt(first.stockVolumeMl, 3),
          diluent: fmt(first.diluentVolumeMl, 3),
        }),
      },
      {
        term: t('series.colTube') + ' ' + last.step,
        value: t('common.worked_SeriesLast', {
          step: last.step,
          stock: fmtSci(n(stock), 4),
          factor: fmtSci(f, 4),
          conc: fmtSci(last.conc, 4),
        }),
      },
      {
        term: 'Σ',
        value: t('common.worked_SeriesTotal', {
          factor: fmtSci(f, 4),
          step: last.step,
          fold: fmtSci(Math.pow(f, last.step), 4),
        }),
      },
    ];
  }, [out, stock, factor, t]);

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
    <Card>
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
        <DilutionDiagram factor={n(factor)} steps={n(steps)} theme={theme} />
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
          <Worked steps={worked} label={t('common.worked')} />
        </div>
      )}
    </Card>
  );
}
