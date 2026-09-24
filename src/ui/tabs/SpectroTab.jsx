import React, { useState, useEffect } from 'react';
import { beerLambert, standardCurve, predictFromCurve, LINEAR_ABSORBANCE_MAX } from '../../calc/reagent.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import { fmt, fmtSci, n, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';

/** Draw the calibration line with its points, so the fit is visible not asserted. */
function CurvePlot({ points, fit, reading, width = 520, height = 220, theme = 'dark' }) {
  const ref = React.useRef(null);
  const palette = React.useMemo(() => (theme === 'light'
    ? { grid: 'rgba(16,24,40,0.1)', label: '#6b7688', line: '#1f6feb', dot: '#1f6feb', read: 'rgba(165,106,0,0.85)' }
    : { grid: 'rgba(255,255,255,0.08)', label: '#9aa3b2', line: '#5aa9ff', dot: '#5aa9ff', read: 'rgba(240,180,41,0.9)' }), [theme]);

  useEffect(() => {
    const c = ref.current;
    if (!c || points.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr; c.height = height * dpr;
    c.style.width = `${width}px`; c.style.height = `${height}px`;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 52, r: 16, t: 14, b: 32 };
    const pw = width - pad.l - pad.r;
    const ph = height - pad.t - pad.b;

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys, 0), yMax = Math.max(...ys, reading ?? 0) * 1.1 || 1;
    const X = (v) => pad.l + ((v - xMin) / (xMax - xMin || 1)) * pw;
    const Y = (v) => pad.t + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;

    ctx.strokeStyle = palette.grid;
    ctx.fillStyle = palette.label;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = yMin + ((yMax - yMin) * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(width - pad.r, Y(v)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v.toFixed(2), pad.l - 6, Y(v) + 3);
    }
    for (let i = 0; i <= 4; i++) {
      const v = xMin + ((xMax - xMin) * i) / 4;
      ctx.beginPath(); ctx.moveTo(X(v), pad.t); ctx.lineTo(X(v), pad.t + ph); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(v.toFixed(2), X(v), height - 10);
    }

    // Fitted line
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(xMin), Y(fit.slope * xMin + fit.intercept));
    ctx.lineTo(X(xMax), Y(fit.slope * xMax + fit.intercept));
    ctx.stroke();

    // Standard points
    ctx.fillStyle = palette.dot;
    for (const p of points) {
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 3.5, 0, Math.PI * 2); ctx.fill();
    }

    // The reading being inverted
    if (reading != null) {
      ctx.strokeStyle = palette.read;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, Y(reading)); ctx.lineTo(width - pad.r, Y(reading)); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [points, fit, reading, width, height, palette]);

  return <canvas ref={ref} className="curve-canvas" role="img" aria-label="standard curve" />;
}

export default function SpectroTab({ onRecord, restored, theme = 'dark' }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(restored?.mode ?? 'absorbance');
  const [epsilon, setEpsilon] = useState(restored?.epsilon != null ? String(restored.epsilon) : '15000');
  const [conc, setConc] = useState(restored?.conc != null ? String(restored.conc) : '0.00005');
  const [path, setPath] = useState(restored?.pathCm != null ? String(restored.pathCm) : '1');
  const [absorbance, setAbsorbance] = useState(restored?.absorbance != null ? String(restored.absorbance) : '0.75');
  const [ptsText, setPtsText] = useState(restored?.ptsText ?? '0, 0.02\n0.2, 0.11\n0.4, 0.21\n0.6, 0.31\n0.8, 0.41');
  const [reading, setReading] = useState(restored?.reading != null ? String(restored.reading) : '0.25');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { setOut(null); setErr(null); }, [mode, epsilon, conc, path, absorbance, ptsText, reading]);

  function parsePoints(text) {
    const pts = [];
    for (const line of String(text).split('\n')) {
      const parts = line.split(/[,，\t]+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
    }
    return pts;
  }

  function run() {
    try {
      let r;
      let inputs;
      if (mode === 'absorbance') {
        inputs = { mode, epsilon: n(epsilon), conc: n(conc), pathCm: n(path) };
        r = beerLambert(inputs);
      } else if (mode === 'concentration') {
        inputs = { mode, epsilon: n(epsilon), absorbance: n(absorbance), pathCm: n(path) };
        r = beerLambert(inputs);
      } else {
        const pts = parsePoints(ptsText);
        const fit = standardCurve(pts);
        const pred = predictFromCurve(fit, n(reading));
        inputs = { mode, ptsText, reading: n(reading) };
        r = { fit, pred, points: pts };
      }
      setOut({ mode, ...r });
      setErr(null);
      onRecord({ kind: 'spectro', inputs, outputs: r, summary: recordSummary({ kind: 'spectro', inputs, outputs: r }, t) });
    } catch (e) {
      setErr(errorMessage(e, t));
      setOut(null);
    }
  }

  const warnMsg = (w) => (w ? errorMessage({ code: w.code, params: w.params }, t) : null);

  // Gate every result block on the mode the result was computed in. The reset
  // effect runs *after* render, so on the render where the mode changes `out`
  // still holds the previous mode's shape — and `out.pred.value` on an
  // absorbance result is a crash, not a stale number. Tagging the result with
  // its own mode makes the mismatch impossible to render.
  const shown = shownFor(out, 'mode', mode);

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="spectro-mode">{t('spectro.mode')}</label>
        <select id="spectro-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="absorbance">{t('spectro.mode_absorbance')}</option>
          <option value="concentration">{t('spectro.mode_concentration')}</option>
          <option value="curve">{t('spectro.mode_curve')}</option>
        </select>
      </div>

      {mode !== 'curve' && (
        <>
          <NumField label={t('spectro.epsilon')} value={epsilon} onChange={setEpsilon} min="0"
            hint={t('spectro.epsilonHint')} />
          <NumField label={t('spectro.path')} value={path} onChange={setPath} min="0"
            hint={t('spectro.pathHint')} />
          {mode === 'absorbance'
            ? <NumField label={t('spectro.conc')} value={conc} onChange={setConc} min="0" hint={t('spectro.concHint')} />
            : <NumField label={t('spectro.absorbance')} value={absorbance} onChange={setAbsorbance} min="0" />}
        </>
      )}

      {mode === 'curve' && (
        <>
          <div className="field">
            <label htmlFor="std-points">{t('spectro.points')}</label>
            <textarea id="std-points" className="points-input" rows={5} value={ptsText}
              onChange={(e) => setPtsText(e.target.value)} spellCheck={false} />
            <div className="hint">{t('spectro.pointsHint')}</div>
          </div>
          <NumField label={t('spectro.reading')} value={reading} onChange={setReading}
            hint={t('spectro.readingHint')} />
        </>
      )}

      <button className="primary" onClick={run}>{t('common.calc')}</button>
      {err && <Err>{err}</Err>}

      {shown?.mode === 'absorbance' && (
        <>
          <Result value={fmt(shown.absorbance, 4)} unit="AU"
            note={t('spectro.absNote')}
            rows={[[t('spectro.absorbance'), fmt(shown.absorbance, 5)]]} />
          {warnMsg(shown.linearityWarning) && <Warn>{warnMsg(shown.linearityWarning)}</Warn>}
        </>
      )}

      {shown?.mode === 'concentration' && (
        <>
          {/* A weak absorber at a short path gives a concentration far below
              1e-8, which fmt rounds to "0" — the reading would say the sample
              is blank. fmtSci keeps the magnitude visible. */}
          <Result value={fmtSci(shown.conc, 4)} unit="mol/L"
            note={t('spectro.concNote')}
            rows={[
              [t('spectro.conc'), `${fmtSci(shown.conc, 4)} mol/L`],
              [t('spectro.concUm'), `${fmtSci(shown.conc * 1e6, 4)} µmol/L`],
            ]} />
          {warnMsg(shown.linearityWarning) && <Warn>{warnMsg(shown.linearityWarning)}</Warn>}
        </>
      )}

      {shown?.mode === 'curve' && (
        <>
          <div className="result">
            <CurvePlot points={shown.points} fit={shown.fit} reading={n(reading)} theme={theme} />
            <div className="result-main">
              {fmtSci(shown.pred.value, 6)}<span className="unit">{t('spectro.predictedConc')}</span>
            </div>
            <div className="result-note">{t('spectro.curveNote', { r2: fmt(shown.fit.r2, 5) })}</div>
            <div className="result-grid">
              <div><span>{t('spectro.slope')}</span><strong>{fmt(shown.fit.slope, 5)}</strong></div>
              <div><span>{t('spectro.intercept')}</span><strong>{fmt(shown.fit.intercept, 5)}</strong></div>
              <div><span>{t('spectro.r2')}</span><strong>{fmt(shown.fit.r2, 5)}</strong></div>
              <div><span>{t('spectro.range')}</span><strong>{fmt(shown.fit.xMin, 4)} – {fmt(shown.fit.xMax, 4)}</strong></div>
            </div>
          </div>
          {shown.pred.outOfRange && (
            <Warn>{t('spectro.outOfRange', { min: fmt(shown.fit.xMin, 4), max: fmt(shown.fit.xMax, 4) })}</Warn>
          )}
          {shown.fit.r2 < 0.99 && <Warn>{t('spectro.lowR2', { r2: fmt(shown.fit.r2, 4) })}</Warn>}
        </>
      )}

      {mode !== 'curve' && <Warn>{t('spectro.warning', { max: LINEAR_ABSORBANCE_MAX })}</Warn>}
    </div>
  );
}
