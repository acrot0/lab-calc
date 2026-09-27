import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useChartDraw, visibleCount, sizeCanvas } from '../chart-animate.mjs';
import {
  titrationCurve, findEquivalencePoint, equivalenceVolumes, locateEquivalencePoint,
} from '../../calc/curve.mjs';
import { NumField, Result, Warn, Err } from '../components/Fields.jsx';
import { UncertaintyPanel, Contribution } from '../components/UncertaintyPanel.jsx';
import { fmt, fmtSci, fmtMeasured, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { recordSummary } from '../summaries.mjs';
import Card from '../components/Card.jsx';
import { chartColors } from '../chart-colors.mjs';
import { productUncertainty } from '../../calc/uncertainty.mjs';
import { glasswareUncertainty } from '../../calc/instruments.mjs';

/** Parse "2.15, 7.20, 12.35" into numbers. Returns null on anything unusable. */
function parsePkaList(text) {
  const parts = String(text).split(/[,，\s]+/).filter((p) => p.length > 0);
  const nums = parts.map(Number);
  if (nums.length === 0 || nums.some((v) => !Number.isFinite(v))) return null;
  return nums;
}

/**
 * Parse a titration table: one `volume, pH` pair per line.
 *
 * Blank lines are skipped rather than reported — a trailing newline is how a
 * textarea ends, not a mistake — but a line that is present and unreadable is
 * kept as-is so the calc layer's own error names the offending row. The shape
 * matches the standards-points box in the spectroscopy tab, so a table pasted
 * into one can be pasted into the other.
 */
function parseRows(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[\s,;]+/).filter(Boolean);
      return { volumeMl: Number(parts[0]), ph: Number(parts[1]) };
    });
}

/*
 * Chart colours come from the active palette.
 *
 * They used to be a two-entry map keyed "dark" and "light", but the prop is the
 * palette *key* — "gruvbox", "solarized-light", "catppuccin-mocha" — so nine of
 * the ten themes matched neither entry and silently drew the dark chart on a
 * light card. Deriving from the palette fixes every theme at once, including
 * ones added later.
 */

/**
 * Draw the curve on a canvas. SVG would need ~160 nodes and per-point
 * interaction this chart never uses; a canvas is cheaper and simpler.
 */
function CurveChart({ points, eqVolumes, width = 560, height = 280, theme = 'dark' }) {
  const { t } = useI18n();
  const ref = useRef(null);
  // Memoised: a fresh object each render would re-run the draw effect on every
  // parent render, redrawing an unchanged chart.
  const palette = useMemo(() => chartColors(theme), [theme]);

  useChartDraw((progress) => {
    const canvas = ref.current;
    if (!canvas || points.length === 0) return;

    const ctx = sizeCanvas(canvas, width, height);
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 46, r: 16, t: 16, b: 34 };
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;

    const maxV = Math.max(...points.map((p) => p.volumeMl));
    const x = (v) => pad.l + (v / maxV) * plotW;
    const y = (ph) => pad.t + plotH - (Math.min(Math.max(ph, 0), 14) / 14) * plotH;

    ctx.strokeStyle = palette.grid;
    ctx.fillStyle = palette.label;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (let ph = 0; ph <= 14; ph += 2) {
      ctx.beginPath();
      ctx.moveTo(pad.l, y(ph));
      ctx.lineTo(width - pad.r, y(ph));
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(ph), pad.l - 8, y(ph) + 4);
    }

    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const v = (maxV * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x(v), pad.t);
      ctx.lineTo(x(v), pad.t + plotH);
      ctx.stroke();
      ctx.fillText(v.toFixed(1), x(v), height - 12);
    }

    /*
     * The buffering region, shaded.
     *
     * Halfway to the first equivalence point the acid is half-deprotonated, so
     * [A-] = [HA] and the Henderson-Hasselbalch log term is zero: pH = pKa
     * there. Around that point the curve is at its flattest, which is what
     * "buffering" means and is the single most examinable feature of the shape.
     * Shading it shows where the flat part is instead of leaving the reader to
     * guess from the curve's slope.
     *
     * The band is drawn before the curve so the curve stays on top of it.
     */
    const firstEq = eqVolumes[0];
    if (Number.isFinite(firstEq) && firstEq > 0) {
      const half = firstEq / 2;
      ctx.fillStyle = palette.band;
      ctx.fillRect(x(half * 0.5), pad.t, x(half * 1.5) - x(half * 0.5), plotH);
    }

    /*
     * The curve sweeps in, and the markers wait for it.
     *
     * Every dashed line here names a volume the reader is meant to read off the
     * curve — the equivalence points and the half-equivalence point where
     * pH = pKa. Drawing them before the curve arrives puts the answers on the
     * axis first, which is the one thing a titration curve is for.
     */
    const sweepV = maxV * Math.min(1, Math.max(0, progress));
    const reached = (v) => v <= sweepV;

    // One dashed marker per equivalence point — a polyprotic acid has several,
    // and drawing only the first would misrepresent the curve.
    ctx.strokeStyle = palette.eq;
    ctx.setLineDash([4, 4]);
    for (const v of eqVolumes) {
      if (v > maxV || !reached(v)) continue;
      ctx.beginPath();
      ctx.moveTo(x(v), pad.t);
      ctx.lineTo(x(v), pad.t + plotH);
      ctx.stroke();
    }

    // The half-equivalence point, where pH = pKa. Labelled because the
    // coincidence is the reason the point is worth marking.
    if (Number.isFinite(firstEq) && firstEq > 0 && reached(firstEq / 2)) {
      const half = firstEq / 2;
      ctx.beginPath();
      ctx.moveTo(x(half), pad.t);
      ctx.lineTo(x(half), pad.t + plotH);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = palette.curve;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const last = visibleCount(progress, points.length) - 1;
    for (let i = 0; i <= last; i++) {
      const p = points[i];
      if (i === 0) ctx.moveTo(x(p.volumeMl), y(p.ph));
      else ctx.lineTo(x(p.volumeMl), y(p.ph));
    }
    ctx.stroke();

    ctx.fillStyle = palette.label;
    ctx.textAlign = 'center';
    ctx.fillText(t('curve.axisX'), pad.l + plotW / 2, height - 1);
  }, [points, eqVolumes, width, height, t, palette]);

  const eq = eqVolumes[0] ?? 0;
  return <canvas ref={ref} className="curve-canvas" role="img"
    aria-label={t('curve.chartLabel', { volume: fmt(eq, 1), ph: fmt(points[0]?.ph ?? 0, 2) })} />;
}

const ACID_TYPES = ['weakAcid', 'strongAcid', 'polyprotic'];

/**
 * A bench titration, as it actually comes off the burette.
 *
 * 0.100 M acetic acid, 50.00 mL, titrated with 0.100 M NaOH, read every 4 mL
 * away from the jump and every 2 mL through it. The equivalence volume is
 * 50.00 mL, so a user who presses the button without reading the hint gets a
 * number they can check against the model above — which is the point of a
 * default: it shows what the feature does before asking for anything.
 *
 * The values come from the app's own curve at those volumes, because a
 * hand-written table would have to be checked against something anyway.
 */
const DEFAULT_TITRATION_ROWS = [
  '0, 2.88', '4, 3.71', '8, 4.04', '12, 4.26', '16, 4.43', '20, 4.58',
  '24, 4.73', '28, 4.87', '32, 5.01', '36, 5.17', '40, 5.36', '44, 5.63',
  '46, 5.82', '48, 6.14', '50, 9.01', '52, 11.29', '54, 11.58',
  '58, 11.87', '62, 12.03', '66, 12.14', '70, 12.22',
].join('\n');

export default function CurveTab({ onRecord, restored, theme = 'dark' }) {
  const { t } = useI18n();
  const [acidType, setAcidType] = useState(restored?.acidType ?? 'weakAcid');
  const [pka, setPka] = useState(restored?.pKa != null ? String(restored.pKa) : '4.76');
  const [pkaList, setPkaList] = useState(restored?.pKas ? restored.pKas.join(', ') : '2.15, 7.20, 12.35');
  const [conc, setConc] = useState(restored?.conc != null ? String(restored.conc) : '0.1');
  const [volume, setVolume] = useState(restored?.volumeMl != null ? String(restored.volumeMl) : '25');
  const [titrant, setTitrant] = useState(restored?.titrantConc != null ? String(restored.titrantConc) : '0.1');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  /*
   * The measured table, and the mode that uses it.
   *
   * The model above answers "where would the equivalence point be, given what
   * I put in the flask". A real titration asks the reverse: here is the burette
   * reading and the pH at each point, where *was* the equivalence point. The
   * two methods for that had been in `curve.mjs` since the module was written
   * and no screen reached them — the module's own tests exercise them against
   * synthetic data, so they were correct and unreachable.
   *
   * `locateEquivalencePoint` is the entry point rather than either method
   * alone: the derivative needs a sample at the equivalence point and is at the
   * mercy of how finely the burette was read, while the Gran plot uses only the
   * straight regions either side and extrapolates. Running them by hand and
   * comparing is the obvious thing to do and it is wrong — the Gran fit needs a
   * hint, and the only hint available is the derivative's answer, which is
   * exactly what is wrong when the curve has two steep regions.
   */
  const [mode, setMode] = useState(restored?.mode ?? 'model');
  const [rowsText, setRowsText] = useState(restored?.rowsText ?? DEFAULT_TITRATION_ROWS);
  const [located, setLocated] = useState(null);

  /*
   * The burette and the standard solution, collapsed by default.
   *
   * The equivalence volume is the one number on this tab a user checks against
   * an instrument reading, and until now it carried no uncertainty at all —
   * the burette table existed in `instruments.mjs` with no tab using it.
   */
  const [uncOpen, setUncOpen] = useState(false);
  const [buretteMl, setBuretteMl] = useState('50');
  const [titrantRelPct, setTitrantRelPct] = useState('0.1');

  /*
   * The budget on the equivalence volume.
   *
   *   V_eq = n_analyte / c_titrant
   *
   * The volume *delivered* is what a burette measures, and it is read twice per
   * titre — the initial and the final reading — so its tolerance applies to
   * each and is counted twice. That is the same trap as a tared balance's
   * linearity, and it is why a 50 mL burette at ±0.05 mL contributes ±0.041 mL
   * rather than ±0.029 mL.
   *
   * The analyte term carries nothing: `conc` and `volume` are the *premise* of
   * the question ("what would this titration give"), not measurements made
   * during it. The standard solution's concentration does carry an uncertainty
   * — it was standardised by someone — so it is an input here, defaulting to
   * 0.1% which is a typical value for a titrant standardised against a primary
   * standard.
   */
  const budget = useMemo(() => {
    if (!out) return null;
    const rel = Math.max(0, n(titrantRelPct) || 0) / 100;
    try {
      const burette = glasswareUncertainty({ kind: 'burette', nominalMl: n(buretteMl) });
      /*
       * Two readings per titre. The tolerance applies to each reading, and the
       * delivered volume is their difference, so the two independent terms add
       * in quadrature: u(delivered) = u(reading) × √2.
       */
      const delivered = { value: out.first.volumeMl, unc: burette.unc * Math.SQRT2 };
      // The concentration divides into the answer, so its relative uncertainty
      // enters as-is. Kept as its own object so the panel's row can name the
      // number rather than recompute it from the same inputs.
      const titrantConc = {
        value: n(titrant),
        unc: Math.abs(n(titrant)) * rel,
      };
      const combined = productUncertainty([
        { value: delivered.value, unc: delivered.unc, power: 1 },
        { value: titrantConc.value, unc: titrantConc.unc, power: 1 },
      ]);
      const relative = combined.value === 0 ? 0 : combined.unc / combined.value;
      /*
       * The uncertainty on the *equivalence volume*, not on the product.
       *
       * `productUncertainty` returns an uncertainty on the quantity it was
       * given — here V × c, whose value is 2.5 and whose uncertainty is
       * 0.0048. The result on screen is 25 mL. Passing the product's absolute
       * figure to `fmtMeasured` printed "± 0.005 mL" against a 25 mL answer
       * that is really ± 0.048 mL: a ten-fold understatement, and it looked
       * plausible because the *relative* figure beside it (0.191%) was
       * correct all along.
       *
       * A relative uncertainty is the same for a quantity and any multiple of
       * it, so scaling by the result converts it — and keeping `volume` as its
       * own object means the caller has an absolute figure that matches the
       * number it is printed next to.
       */
      const volume = {
        value: out.first.volumeMl,
        unc: relative * out.first.volumeMl,
      };
      return {
        burette,
        delivered,
        titrant: titrantConc,
        combined,
        volume,
        relative,
      };
    } catch {
      // An unlisted burette capacity is not a reason to lose the curve.
      return null;
    }
  }, [out, buretteMl, titrantRelPct, titrant]);

  /*
   * Where the equivalence volume comes from.
   *
   * The curve itself shows the answer; this shows the one line that produces
   * it — moles of analyte divided by titrant concentration — because that is
   * the number people want to check against their own burette reading.
   */
  const worked = useMemo(() => {
    if (!out) return null;
    const analyteMoles = n(conc) * (n(volume) / 1000);
    const steps = [
      {
        term: 'n',
        value: t('common.worked_EquivMoles', {
          conc: fmtSci(n(conc), 4),
          volume: fmt(n(volume) / 1000, 4),
          moles: fmtSci(analyteMoles, 4),
        }),
      },
      {
        term: 'V',
        value: t('common.worked_EquivVolume', {
          moles: fmtSci(analyteMoles, 4),
          titrant: fmtSci(n(titrant), 4),
          volume: fmt(out.first.volumeMl, 3),
        }),
      },
      {
        term: 'pH',
        value: t('common.worked_EquivPh', { ph: fmt(out.first.ph, 3) }),
      },
    ];
    if (acidType === 'weakAcid') {
      steps.push({
        term: t('curve.halfEquivalence'),
        value: t('common.worked_HalfEquiv', { pka: fmt(n(pka), 3) }),
      });
    } else if (acidType === 'polyprotic') {
      const pKas = parsePkaList(pkaList) ?? [];
      if (pKas.length > 0) {
        steps.push({
          term: t('curve.halfEquivalence'),
          value: t('common.worked_HalfEquiv', { pka: pKas.map((k) => fmt(k, 3)).join(' / ') }),
        });
      }
    }
    return steps;
  }, [out, conc, volume, titrant, acidType, pka, pkaList, t]);

  /*
   * The derivation for the measured mode.
   *
   * Different arithmetic from the model above and worth showing for the same
   * reason: the answer is an extrapolation, not a division, and a user who
   * cannot see that has no way to judge how much to trust the number.
   */
  const locatedWorked = useMemo(() => {
    if (!located) return null;
    const d = located.derivative;
    const gran = located.gran;
    const steps = [
      { term: t('curve.byDerivativeTerm'), value: t('curve.worked_Derivative', {
        n: parseRows(rowsText).length,
        volume: fmt(d.sampledVolumeMl, 3),
        slope: fmtSci(d.maxSlope, 4),
        refined: fmt(d.volumeMl, 3),
      }) },
    ];
    if (gran.side) {
      steps.push({ term: t('curve.byGranTerm'), value: t('curve.worked_Gran', {
        side: t(`curve.side_${gran.side}`),
        r2: fmt(gran.r2, 5),
        volume: fmt(gran.volumeMl, 3),
      }) });
    }
    steps.push({ term: t('curve.chosenTerm'), value: t('curve.worked_Chosen', {
      method: t(`curve.method_${located.method}`),
      reason: located.method === 'gran' ? t('curve.reasonGran') : t('curve.reasonDerivative'),
    }) });
    return steps;
  }, [located, rowsText, t]);

  useEffect(() => { setOut(null); setErr(null); }, [acidType, pka, pkaList, conc, volume, titrant]);
  // Editing the table invalidates the located point: the numbers below would
  // describe a table that is no longer on screen.
  useEffect(() => { setLocated(null); setErr(null); }, [rowsText]);

  function buildSpec() {
    const base = { conc: n(conc), volumeMl: n(volume), titrantConc: n(titrant) };
    if (acidType === 'strongAcid') return { ...base, strongAcid: true };
    if (acidType === 'polyprotic') {
      const pKas = parsePkaList(pkaList);
      if (!pKas) throw new Error('pkaListInvalid');
      return { ...base, pKas };
    }
    return { ...base, pKa: n(pka) };
  }

  /**
   * Locate the equivalence point in a measured table.
   *
   * The rows are parsed here rather than by the calc layer because a blank line
   * and a malformed one are different things: a trailing newline is how a
   * textarea ends, while `abc, 7` is a row the user believes they entered. The
   * blanks are dropped and everything else is passed through, so
   * `titrationRows` reports the unreadable one by position.
   */
  function runMeasured() {
    try {
      const rows = parseRows(rowsText);
      const r = locateEquivalencePoint(rows, { initialVolumeMl: 0 });
      setLocated(r);
      setErr(null);
      const inputs = { mode: 'measured', rowsText, initialVolumeMl: 0 };
      const outputs = {
        volumeMl: r.volumeMl,
        method: r.method,
        granR2: r.gran?.r2 ?? null,
      };
      onRecord({
        kind: 'titrationCurve', inputs, outputs,
        summary: recordSummary({ kind: 'titrationCurve', inputs, outputs }, t),
      });
    } catch (e) {
      setErr(errorMessage(e, t));
      setLocated(null);
    }
  }

  function run() {
    try {
      const spec = buildSpec();
      const eqVolumes = equivalenceVolumes(spec);
      const first = findEquivalencePoint(spec);
      const points = titrationCurve({ ...spec, points: 200 });
      setOut({ points, eqVolumes, first });
      setErr(null);
      const inputs = acidType === 'polyprotic'
        ? { acidType, pKas: parsePkaList(pkaList), conc: n(conc), volumeMl: n(volume), titrantConc: n(titrant) }
        : { acidType, pKa: acidType === 'strongAcid' ? null : n(pka), conc: n(conc), volumeMl: n(volume), titrantConc: n(titrant) };
      onRecord({
        kind: 'titrationCurve', inputs,
        outputs: { equivalenceMl: first.volumeMl, equivalencePh: first.ph },
        summary: recordSummary({ kind: 'titrationCurve', inputs, outputs: { equivalenceMl: first.volumeMl, equivalencePh: first.ph } }, t),
      });
    } catch (e) {
      setErr(e.message === 'pkaListInvalid' ? t('curve.pkaListHint') : errorMessage(e, t));
      setOut(null);
    }
  }

  return (
    <Card>
      <div className="field">
        <label htmlFor="curve-mode">{t('curve.mode')}</label>
        <select id="curve-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="model">{t('curve.mode_model')}</option>
          <option value="measured">{t('curve.mode_measured')}</option>
        </select>
      </div>

      {mode === 'measured' ? (
        <>
          <div className="field">
            <label htmlFor="titration-rows">{t('curve.rows')}</label>
            <textarea id="titration-rows" className="points-input" rows={8} value={rowsText}
              onChange={(e) => setRowsText(e.target.value)} spellCheck={false} />
            <div className="hint">{t('curve.rowsHint')}</div>
          </div>
          <button className="primary" onClick={runMeasured}>{t('curve.locate')}</button>
          {err && <Err>{err}</Err>}
          {located && (
            <div className="result">
              <Result
                value={fmt(located.volumeMl, 2)}
                unit={t('curve.equivalenceUnit')}
                note={t('curve.locatedNote', {
                  method: t(`curve.method_${located.method}`),
                })}
                worked={locatedWorked} workedLabel={t('common.worked')}
                rows={[
                  [t('curve.byDerivative'), `${fmt(located.derivative.volumeMl, 3)} mL`],
                  [t('curve.byGran'), located.gran.volumeMl != null
                    ? `${fmt(located.gran.volumeMl, 3)} mL` : '—'],
                  /*
                   * Whether the two agree is the diagnostic, not decoration.
                   * Two independent methods landing on the same volume is
                   * evidence; disagreeing by more than 2% is a finding about
                   * the data — too coarse a grid, or an acid not behaving —
                   * and averaging it away would hide the only warning there is.
                   */
                  [t('curve.agree'), located.agree ? t('curve.agreeYes') : t('curve.agreeNo')],
                  [t('curve.granFit'), located.gran.r2 != null ? fmt(located.gran.r2, 5) : '—'],
                ]}
              />
              {!located.agree && <Warn>{t('curve.disagreeWarn')}</Warn>}
            </div>
          )}
          <Warn>{t('curve.measuredWarning')}</Warn>
        </>
      ) : (
        <>
      <div className="field">
        <label htmlFor="acid-type">{t('curve.acidType')}</label>
        <select id="acid-type" value={acidType} onChange={(e) => setAcidType(e.target.value)}>
          {ACID_TYPES.map((k) => <option key={k} value={k}>{t(`curve.${k}`)}</option>)}
        </select>
      </div>

      {acidType === 'weakAcid' && (
        <NumField label={t('curve.pka')} value={pka} onChange={setPka} hint={t('curve.pkaHint')} />
      )}
      {acidType === 'polyprotic' && (
        <div className="field">
          <label htmlFor="pka-list">{t('curve.pkaList')}</label>
          <input id="pka-list" type="text" value={pkaList}
            onChange={(e) => setPkaList(e.target.value)} placeholder={t('curve.pkaListHint')} />
          <div className="hint">{t('curve.pkaListHint')}</div>
        </div>
      )}

      <div className="row">
        <NumField label={t('curve.acidConc')} value={conc} onChange={setConc} min="0" />
        <NumField label={t('curve.acidVolume')} value={volume} onChange={setVolume} min="0" />
      </div>
      <NumField label={t('curve.titrantConc')} value={titrant} onChange={setTitrant} min="0" hint={t('curve.titrantHint')} />

      <button className="primary" onClick={run}>{t('curve.run')}</button>
      {err && <Err>{err}</Err>}

      {out && (
        <div className="result">
          <CurveChart points={out.points} eqVolumes={out.eqVolumes} theme={theme} />
          <Result
            value={fmt(out.first.volumeMl, 2)}
            unit={t('curve.equivalenceUnit')}
            note={t('curve.equivalenceNote', { ph: fmt(out.first.ph, 2) })}
            unc={uncOpen && budget ? {
              ...fmtMeasured(budget.volume.value, budget.volume.unc, { unit: ' mL' }),
              detail: `${t('unc.uncRelative')} ${fmtSci(budget.relative * 100, 3)}%`,
            } : null}
            worked={worked} workedLabel={t('common.worked')}
            rows={[
              [t('curve.equivalenceVolume'), `${fmt(out.first.volumeMl, 3)} mL`],
              [t('curve.equivalencePh'), fmt(out.first.ph, 3)],
              ...(out.eqVolumes.length > 1
                ? [[t('curve.allEquivalence'), out.eqVolumes.map((v) => fmt(v, 1)).join(' / ') + ' mL']]
                : [[t('curve.halfEquivalence'), t('curve.halfEquivalenceValue', { pka: acidType === 'polyprotic' ? (parsePkaList(pkaList) ?? [])[0] : fmt(n(pka), 2) })]]),
            ]}
          />
          {/* Names what the shading and the dashed lines mean. Without it the
              band is a decoration and the reader has to infer its meaning from
              the curve's slope, which is the opposite of explaining it. */}
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-sw legend-sw-band" />
              {t('curve.bandLabel')}
            </span>
            <span className="legend-item">
              <span className="legend-sw legend-sw-eq" />
              {t('curve.eqLabel')}
            </span>
          </div>
        </div>
      )}

      <Warn>{t('curve.warning')}</Warn>

      <UncertaintyPanel
        open={uncOpen}
        onToggle={() => setUncOpen((v) => !v)}
        budget={budget}
        state={{}}
        intro={t('unc.uncBuretteIntro')}
        caveats={(
          <>
            <p className="unc-caveat">{t('unc.uncBuretteNotModelled')}</p>
          </>
        )}
        fields={(
          <>
            <NumField label={t('unc.uncBuretteSize')} value={buretteMl} onChange={setBuretteMl} min="0" />
            <NumField label={t('unc.uncTitrantRel')} value={titrantRelPct} onChange={setTitrantRelPct} min="0" />
          </>
        )}
      >
        <Contribution
          label={t('unc.uncBurette')} value={budget?.delivered.value}
          unc={budget?.delivered.unc} unit="mL"
        />
        <Contribution
          label={t('unc.uncTitrant')} value={budget?.titrant.value}
          unc={budget?.titrant.unc} unit="mol/L"
        />
      </UncertaintyPanel>
        </>
      )}
    </Card>
  );
}
