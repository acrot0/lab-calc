import React, { useState, useEffect, useRef, useMemo } from 'react';
import { beerLambert, standardCurve, predictFromCurve, LINEAR_ABSORBANCE_MAX } from '../../calc/reagent.mjs';
import { NumField, Result, Warn, Err, Worked } from '../components/Fields.jsx';
import { UncertaintyPanel, Contribution } from '../components/UncertaintyPanel.jsx';
import { fmt, fmtSci, fmtMeasured, n, shownFor } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';
import { chartColors } from '../chart-colors.mjs';
import { productUncertainty } from '../../calc/uncertainty.mjs';
import {
  spectrophotometerUncertainty, cuvetteUncertainty, SPECTROPHOTOMETER_ACCURACY_A,
} from '../../calc/instruments.mjs';

/** Draw the calibration line with its points, so the fit is visible not asserted. */
function CurvePlot({ points, fit, reading, width = 520, height = 220, theme = 'dark' }) {
  const ref = React.useRef(null);
  const c = React.useMemo(() => chartColors(theme), [theme]);
  const palette = React.useMemo(() => ({
    grid: c.grid, label: c.label, line: c.curve, dot: c.point, read: c.eq,
  }), [c]);

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

/**
 * The residual plot, which is what actually shows whether a line fits.
 *
 * R² alone cannot answer that. Standards spread widely enough score above 0.99
 * while sitting on a visible curve, because the residuals are small next to the
 * spread they are being compared against. Plotted against x, the same residuals
 * make the shape obvious: random scatter around zero means the line is
 * appropriate, a systematic arc means the relationship is not linear and no
 * amount of R² will say so.
 *
 * Drawn as a strip rather than a full chart — the y range is the residual
 * spread, which is small by definition, and giving it the same height as the
 * curve would exaggerate noise into structure.
 */
function ResidualPlot({ points, fit, width = 520, height = 110, theme = 'dark' }) {
  const ref = useRef(null);
  // Both plots sit on one tab, so they read the same palette — a mismatch
  // between them would be the first thing a reader noticed.
  const c = useMemo(() => chartColors(theme), [theme]);
  const palette = useMemo(() => ({ grid: c.grid, label: c.label, dot: c.point }), [c]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !fit?.residuals?.length) return;

    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 52, r: 16, t: 12, b: 22 };
    const pw = width - pad.l - pad.r;
    const ph = height - pad.t - pad.b;

    const xs = points.map((p) => p.x);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    // Symmetric about zero so the eye reads the zero line as the centre, and
    // with a floor so a perfect fit does not divide by zero.
    const span = Math.max(...fit.residuals.map((r) => Math.abs(r)), 1e-9) * 1.25;
    const X = (v) => pad.l + ((v - xMin) / (xMax - xMin || 1)) * pw;
    const Y = (v) => pad.t + ph / 2 - (v / span) * (ph / 2);

    // The zero line: a residual's sign is read against it.
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, Y(0));
    ctx.lineTo(width - pad.r, Y(0));
    ctx.stroke();

    ctx.fillStyle = palette.label;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`+${span.toFixed(3)}`, pad.l - 6, pad.t + 8);
    ctx.fillText('0', pad.l - 6, Y(0) + 3);
    ctx.fillText(`-${span.toFixed(3)}`, pad.l - 6, pad.t + ph);

    ctx.fillStyle = palette.dot;
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(X(p.x), Y(fit.residuals[i]), 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [points, fit, width, height, palette]);

  return <canvas ref={ref} className="curve-canvas residual-canvas" role="img" aria-label="residuals" />;
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

  /*
   * The photometer's own numbers, collapsed by default.
   *
   * Defaults rather than blanks, for the same reason the weighing tab has them:
   * a budget with a missing input reports less uncertainty than there is, and
   * the user has no way to tell it was incomplete. ±0.003 A is the typical
   * single-monochromator specification and ±0.05 mm the standard cell
   * tolerance, so the defaults describe the instrument a teaching lab has.
   */
  const [uncOpen, setUncOpen] = useState(false);
  const [pathTolMm, setPathTolMm] = useState('0.05');
  const [accuracyA, setAccuracyA] = useState(String(SPECTROPHOTOMETER_ACCURACY_A));

  /*
   * The budget for Beer's law, in whichever direction the tab was asked.
   *
   *   A = ε · c · l   ⟹   c = A / (ε · l)
   *
   * All three are a product, so relative uncertainties add in quadrature. The
   * two instrument terms behave differently and that is the point of showing
   * them apart: the cell's is a fixed 0.29% of the path, while the photometer's
   * is a fixed 0.003 A — negligible against a reading of 0.8 and dominant
   * against one of 0.05.
   *
   * `ε` carries no uncertainty of its own here. A tabulated molar absorptivity
   * is quoted to more digits than it deserves, but the error in it is a
   * *property of the substance and the wavelength*, not of this measurement —
   * inventing a number for it would put a term in the budget that the user
   * cannot check. The caveat below says so instead.
   */
  const budget = useMemo(() => {
    const shownOut = shownFor(out, 'mode', mode);
    if (!shownOut || mode === 'curve') return null;
    /*
     * The path length is taken from the field the calculation already used, not
     * asked for a second time in cm-to-mm disguise. Two inputs for one physical
     * quantity is a budget that can disagree with the result it is qualifying —
     * and the user would have no way to see which one the answer came from.
     */
    const pathCm = n(path);
    if (!Number.isFinite(pathCm) || pathCm <= 0) return null;
    const pathMmValue = pathCm * 10;
    try {
      const readingAbs = mode === 'absorbance' ? shownOut.absorbance : n(absorbance);
      const meter = spectrophotometerUncertainty({ absorbance: readingAbs, accuracyA: n(accuracyA) });
      /*
       * The cell only enters the budget when the cell's own path is a *divisor*
       * in the answer. In absorbance mode the tab is given c and l and returns
       * A — the path is already folded into the answer, and no uncertainty on
       * it can move a number that was computed from it as a known input. Showing
       * a path row there would claim a contribution that does not exist.
       *
       * In concentration mode the answer is A/(ε·l), so the path's uncertainty
       * divides into the result and belongs.
       */
      const usesCell = mode === 'concentration';
      const cell = usesCell
        ? cuvetteUncertainty({ pathMm: pathMmValue, toleranceMm: n(pathTolMm) })
        : null;
      // The cell's uncertainty is absolute in mm and the product term needs it
      // in the same units as the path, so it is scaled to cm here rather than
      // the path being converted in the product — the returned `cell` stays in
      // mm, which is what its own row displays.
      const combined = productUncertainty(usesCell ? [
        { value: readingAbs, unc: meter.unc, power: 1 },
        { value: pathCm, unc: cell.unc / 10, power: 1 },
      ] : [
        { value: readingAbs, unc: meter.unc, power: 1 },
      ]);
      /*
       * The relative uncertainty belongs to the *result*, and the result is a
       * different quantity in each direction:
       *
       *   - absorbance mode returns A, and the cell plays no part in A — the
       *     photometer's own term is the whole of it.
       *   - concentration mode returns c = A/(ε·l), where the cell's path is a
       *     divisor and does contribute.
       *
       * Using the product's figure for both put 0.436% in the panel while the
       * result above it said 0.327% — two relative uncertainties for one
       * calculation, which is the defect this panel exists to prevent, in the
       * direction that overstates.
       */
      const resultRelative = mode === 'absorbance'
        ? (readingAbs === 0 ? 0 : meter.unc / readingAbs)
        : (combined.value === 0 ? 0 : combined.unc / combined.value);
      return {
        cell,
        meter,
        combined,
        usesCell,
        relative: resultRelative,
        // The concentration is the result in one direction and the input in the
        // other, so the budget reports the *reading* in both cases and the
        // caller decides what to attach it to.
        reading: readingAbs,
      };
    } catch {
      // An unparseable tolerance is not a reason to lose the main result; the
      // panel says the budget is unavailable instead of showing a zero.
      return null;
    }
  }, [out, mode, path, pathTolMm, accuracyA, absorbance]);

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

  /*
   * Beer-Lambert, shown both directions.
   *
   * The same equation is solved two ways depending on which variable the user
   * supplied, and writing out the substitution is what lets them check that
   * the extinction coefficient and path length they entered are the ones that
   * produced the answer.
   */
  const worked = useMemo(() => {
    if (!shown) return null;
    if (mode === 'absorbance') {
      return [
        { term: t('common.worked_Beer'), value: '' },
        {
          term: 'A',
          value: t('common.worked_BeerConc', {
            epsilon: fmtSci(n(epsilon), 4),
            path: fmt(n(path), 4),
            conc: fmtSci(n(conc), 4),
            abs: fmt(shown.absorbance ?? 0, 4),
          }),
        },
      ];
    }
    if (mode === 'concentration') {
      return [
        {
          term: 'c',
          value: t('common.worked_BeerSolve', {
            abs: fmt(n(absorbance), 4),
            epsilon: fmtSci(n(epsilon), 4),
            path: fmt(n(path), 4),
            conc: fmtSci(shown.conc ?? 0, 4),
          }),
        },
      ];
    }
    return [
      { term: t('common.worked_CurveFit'), value: '' },
      {
        term: 'k, b',
        value: t('common.worked_CurveFitStep', {
          slope: fmt(shown.fit?.slope ?? 0, 5),
          intercept: fmt(shown.fit?.intercept ?? 0, 5),
        }),
      },
      {
        term: 'c',
        value: t('common.worked_CurvePredict', {
          reading: fmt(n(reading), 4),
          intercept: fmt(shown.fit?.intercept ?? 0, 5),
          slope: fmt(shown.fit?.slope ?? 0, 5),
          conc: fmtSci(shown.pred?.value ?? 0, 4),
        }),
      },
    ];
  }, [shown, mode, epsilon, conc, path, absorbance, reading, t]);

  return (
    <Card>
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
            rows={[[t('spectro.absorbance'), fmt(shown.absorbance, 5)]]}
            unc={uncOpen && budget ? {
              ...fmtMeasured(shown.absorbance, budget.meter.unc, { unit: ' AU' }),
              detail: `${t('unc.uncRelative')} ${fmtSci(budget.meter.unc / (shown.absorbance || 1) * 100, 3)}%`,
            } : null}
            worked={worked} workedLabel={t('common.worked')} />
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
            ]}
            unc={uncOpen && budget ? {
              ...fmtMeasured(shown.conc, budget.relative * shown.conc, { unit: ' mol/L' }),
              detail: `${t('unc.uncRelative')} ${fmtSci(budget.relative * 100, 3)}%`,
            } : null}
            worked={worked} workedLabel={t('common.worked')} />
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
              {/* The slope's uncertainty, which is the number that says whether
                  the calibration is precise enough to be worth using. A slope
                  of 15000 ± 4000 and one of 15000 ± 20 are different
                  measurements that print the same R². */}
              <div><span>{t('spectro.slopeError')}</span><strong>± {fmtSci(shown.fit.slopeStdError, 3)}</strong></div>
              <div><span>{t('spectro.residError')}</span><strong>{fmtSci(shown.fit.standardError, 3)}</strong></div>
            </div>

            {/* The residual plot, which is what actually answers "is a line
                appropriate here" — see the note on ResidualPlot. */}
            <div className="residual-block">
              <div className="hint">{t('spectro.residualNote')}</div>
              <ResidualPlot points={shown.points} fit={shown.fit} theme={theme} />
            </div>
          </div>
          {shown.pred.outOfRange && (
            <Warn>{t('spectro.outOfRange', { min: fmt(shown.fit.xMin, 4), max: fmt(shown.fit.xMax, 4) })}</Warn>
          )}
          <Worked steps={worked} label={t('common.worked')} />
          {shown.fit.r2 < 0.99 && <Warn>{t('spectro.lowR2', { r2: fmt(shown.fit.r2, 4) })}</Warn>}
        </>
      )}

      {mode !== 'curve' && <Warn>{t('spectro.warning', { max: LINEAR_ABSORBANCE_MAX })}</Warn>}

      {/*
        Not shown in curve mode: a standard curve is a regression on measured
        points, and the budget for it is the slope's standard error — which the
        result block already reports. Attaching a photometer budget there would
        be two answers to one question.
      */}
      {mode !== 'curve' && (
        <UncertaintyPanel
          open={uncOpen}
          onToggle={() => setUncOpen((v) => !v)}
          budget={budget}
          state={{}}
          intro={t(mode === 'absorbance' ? 'unc.uncSpectroIntroAbs' : 'unc.uncSpectroIntro')}
          caveats={(
            <>
              <p className="unc-caveat">
                {t(mode === 'absorbance' ? 'unc.uncSpectroNotModelledAbs' : 'unc.uncSpectroNotModelled')}
              </p>
              <p className="unc-caveat">{t('unc.uncSpectroRange')}</p>
            </>
          )}
          fields={(
            <>
              {/* The path itself is already an input above; only its tolerance
                  is asked for here. Hidden in absorbance mode, where the path
                  does not contribute — a field that changes nothing is worse
                  than an absent one, because the user adjusts it and sees no
                  movement in the number below. */}
              {mode === 'concentration' && (
                <NumField label={t('unc.uncCuvettePathTol')} value={pathTolMm} onChange={setPathTolMm} min="0" />
              )}
              <NumField label={t('unc.uncPhotoAccuracy')} value={accuracyA} onChange={setAccuracyA} min="0" />
            </>
          )}
        >
          <Contribution
            label={t('unc.uncPhoto')} value={budget?.meter.value}
            unc={budget?.meter.unc} unit="AU"
          />
          {budget?.cell && (
            <Contribution
              label={t('unc.uncCuvette')} value={budget.cell.value}
              unc={budget.cell.unc} unit="mm"
            />
          )}
        </UncertaintyPanel>
      )}
    </Card>
  );
}
