import React, { useState, useEffect } from 'react';
import { bufferRecipe } from '../../calc/buffer.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import BufferDiagram from '../components/diagrams/BufferDiagram.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

export default function BufferTab({ onRecord, restored }) {
  const { t } = useI18n();
  const [pka, setPka] = useState(restored?.pKa != null ? String(restored.pKa) : '4.76');
  const [ph, setPh] = useState(restored?.targetPh != null ? String(restored.targetPh) : '5.0');
  const [total, setTotal] = useState(restored?.totalConc != null ? String(restored.totalConc) : '0.1');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);
  const [showDiagram, setShowDiagram] = useState(false);

  useEffect(() => { setOut(null); setErr(null); }, [pka, ph, total]);

  function run() {
    try {
      const inputs = { pKa: n(pka), targetPh: n(ph), totalConc: n(total) };
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

  return (
    <div className="card">
      <div className="row">
        <NumField label={t('buffer.pka')} value={pka} onChange={setPka} hint={t('buffer.pkaHint')} />
        <NumField label={t('buffer.targetPh')} value={ph} onChange={setPh} />
      </div>
      <NumField label={t('buffer.totalConc')} value={total} onChange={setTotal} min="0" hint={t('buffer.totalConcHint')} />
      <div className="row row-actions">
        <button className="primary" onClick={run}>{t('common.calc')}</button>
        {/* Collapsed by default. The diagram explains the equation, which is
            worth reading once — not on every visit, and not while typing a
            number into the field above it. */}
        <button className="link-btn" onClick={() => setShowDiagram((v) => !v)}>
          {showDiagram ? t('diagram.hide') : t('diagram.show')}
        </button>
      </div>
      {showDiagram && <BufferDiagram pka={n(pka) || 4.76} />}
      {err && <Err>{err}</Err>}
      {out && !out.inRange && <Warn>{t('buffer.warning')}</Warn>}
      <Result
        value={out ? fmt(out.ratio, 3) : null}
        unit={t('buffer.ratioUnit')}
        note={out ? t('buffer.equation', { pka: fmt(out.pKa, 2), log: fmt(Math.log10(out.ratio), 3) }) : null}
        rows={out ? [
          [t('buffer.acid'), `${fmtSci(out.acidConc, 4)} mol/L`],
          [t('buffer.base'), `${fmtSci(out.baseConc, 4)} mol/L`],
          [t('buffer.range'), out.inRange ? t('buffer.inRange') : t('buffer.outOfRange')],
        ] : null}
      />
    </div>
  );
}
