import React, { useEffect, useRef, useMemo } from 'react';
import { useI18n } from '../LocaleContext.jsx';
import { chartColors } from '../chart-colors.mjs';
import { niceTicks } from './chart-axis.mjs';
import { fmt } from '../format.mjs';

/**
 * The two-liquidus phase diagram with its eutectic marked.
 *
 * ## Why this is drawn
 *
 * A eutectic is a point where two curves cross, and the numbers alone — the
 * eutectic temperature and the composition — do not say where that point sits
 * relative to the two pure melting points, which is the thing the diagram is
 * for. A eutectic at 20 mol% looks very different from one at 50%, and the two
 * give the same two numbers.
 *
 * ## Why both curves are drawn past the crossing
 *
 * Each liquidus is only physically meaningful on its own side of the eutectic:
 * to the right of the crossing the A curve is below the B curve and describes a
 * liquid that would already have frozen. Drawing the metastable extensions as
 * dashed lines is the convention every physical chemistry text uses, and it is
 * what makes the crossing read as a crossing rather than as two lines that
 * happen to meet.
 */
export default function PhaseDiagram({ result, theme = 'dark', width = 520, height = 300 }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const c = useMemo(() => chartColors(theme), [theme]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !result?.exists || !result.curve?.length) return undefined;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 54, r: 16, t: 16, b: 40 };
    const pw = width - pad.l - pad.r;
    const ph = height - pad.t - pad.b;

    const { curve } = result;
    const temps = curve.flatMap((p) => [p.tA, p.tB]).filter(Number.isFinite);
    /*
     * The y range is padded by 8% and floored a little below the lowest curve
     * point, so the eutectic dip is not sitting on the axis where its exact
     * value is hard to read.
     */
    const rawMin = Math.min(...temps);
    const rawMax = Math.max(...temps);
    const span = Math.max(rawMax - rawMin, 1);
    const yMin = rawMin - span * 0.08;
    const yMax = rawMax + span * 0.08;

    const X = (x) => pad.l + x * pw;
    const Y = (tempK) => pad.t + ph - ((tempK - yMin) / (yMax - yMin)) * ph;

    // --- grid ---------------------------------------------------------------
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = c.label;

    for (const tick of niceTicks(yMax, 5, yMin)) {
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(tick));
      ctx.lineTo(pad.l + pw, Y(tick));
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      // Kelvin is what the model works in; Celsius is what a lab reads.
      ctx.fillText(fmt(tick - 273.15, 4), pad.l - 8, Y(tick));
    }
    for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.moveTo(X(tick), pad.t);
      ctx.lineTo(X(tick), pad.t + ph);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(tick.toFixed(2), X(tick), pad.t + ph + 8);
    }

    // --- the two liquidus curves --------------------------------------------
    /*
     * The segment on each curve's own side of the eutectic is solid; the
     * extension past it is dashed. Drawn by walking the sampled points and
     * switching style when the composition passes the eutectic, rather than by
     * splitting the array first, because the crossing falls between samples.
     */
    const drawCurve = (key, otherKey, isLeftOfEutectic, colour) => {
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeStyle = colour;
      ctx.beginPath();
      let started = false;
      for (const p of curve) {
        const stable = isLeftOfEutectic ? p.xA <= result.xA : p.xA >= result.xA;
        if (!stable) continue;
        const x = X(p.xA);
        const y = Y(p[key]);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      started = false;
      for (const p of curve) {
        const stable = isLeftOfEutectic ? p.xA <= result.xA : p.xA >= result.xA;
        if (stable) continue;
        const x = X(p.xA);
        const y = Y(p[key]);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    /*
     * Two curves from the palette's own vocabulary: the accent for the first
     * component and the "ok" green for the second. `chartColors` derives both
     * per theme, so a new palette gets a correct diagram by existing — the
     * failure this avoids is a hardcoded hex that reads on one theme and
     * vanishes on another.
     */
    // A is the left-hand component: its liquidus is stable up to the eutectic.
    drawCurve('tA', 'tB', true, c.curve);
    drawCurve('tB', 'tA', false, c.fit);

    // --- the eutectic -------------------------------------------------------
    const ex = X(result.xA);
    const ey = Y(result.eutecticTempK);
    ctx.strokeStyle = c.label;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex, pad.t + ph);
    ctx.moveTo(pad.l, ey);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = c.label;
    ctx.beginPath();
    ctx.arc(ex, ey, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      t('physical.eutecticLabel', { temp: fmt(result.eutecticTempC, 4) }),
      ex + 8, ey - 6,
    );

    // --- axis titles --------------------------------------------------------
    ctx.fillStyle = c.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(t('physical.axisTemp'), pad.l + pw / 2, height - 16);
    ctx.save();
    ctx.translate(14, pad.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'middle';
    ctx.fillText(t('physical.axisMole'), 0, 0);
    ctx.restore();
  }, [result, theme, width, height, c, t]);

  if (!result?.exists) return null;
  return (
    <canvas
      ref={ref}
      className="chart-canvas"
      role="img"
      aria-label={t('physical.eutecticAria', {
        temp: fmt(result.eutecticTempC, 4),
        x: fmt(result.xA * 100, 3),
      })}
    />
  );
}
