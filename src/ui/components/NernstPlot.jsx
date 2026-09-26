import React, { useEffect, useRef, useMemo } from 'react';
import { useI18n } from '../LocaleContext.jsx';
import { chartColors } from '../chart-colors.mjs';
import { niceTicks } from './chart-axis.mjs';
import { fmt } from '../format.mjs';

/**
 * The Nernst line: cell potential against log Q.
 *
 * ## What the single number cannot say
 *
 * The tab reports one potential for one reaction quotient. But E depends on Q
 * logarithmically, so the question that usually matters is not "what is E now"
 * but "how much can Q move before the cell stops driving the reaction" — and
 * that is where the line crosses E = 0. Drawn, the crossing is a distance along
 * the axis; tabulated, it is a number the reader has to solve for.
 *
 * The slope is RT·ln10/nF, so the line's steepness *is* the n and the
 * temperature the tab is set to. Changing either rotates the line about
 * log Q = 0, which is the relationship four separate rows of a result table
 * cannot express.
 *
 * ## Why the operating point is drawn on the line rather than as a row
 *
 * The point on the line is the answer, and the distance from it to the crossing
 * is the headroom. A reader who sees the marker near the crossing has learned
 * that the cell is close to equilibrium, which is a fact about their setup
 * rather than about the arithmetic.
 */
export default function NernstPlot({ line, theme = 'dark', width = 520, height = 260 }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const c = useMemo(() => chartColors(theme), [theme]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !line?.points?.length) return undefined;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 56, r: 16, t: 16, b: 38 };
    const pw = width - pad.l - pad.r;
    const ph = height - pad.t - pad.b;

    const { points, logQMin, logQMax } = line;
    const eValues = points.map((p) => p.e);
    let eMin = Math.min(...eValues);
    let eMax = Math.max(...eValues);

    /*
     * E = 0 joins the range only when the crossing is inside the window.
     *
     * Forcing it in unconditionally was the first version, and it produced a
     * line squashed into a sliver at the top of the plot: a Daniell cell's
     * window spans 1.07–1.13 V while E = 0 is a full volt below, so 95% of the
     * canvas was empty space between the line and an axis line the reader
     * cannot act on. When the cell is that far from equilibrium the E = 0 guide
     * is not drawn either — there is nothing there to read against.
     */
    if (line.zeroCrossing != null) {
      eMin = Math.min(0, eMin);
      eMax = Math.max(0, eMax);
    }

    // Air above and below, so the line does not run along the frame. A
    // degenerate span — a cell with E° of exactly 0 — would divide by zero.
    const headroom = (eMax - eMin) * 0.12 || 1;
    eMin -= headroom;
    eMax += headroom;
    const span = eMax - eMin;

    const X = (v) => pad.l + ((v - logQMin) / (logQMax - logQMin)) * pw;
    const Y = (v) => pad.t + ph - ((v - eMin) / span) * ph;

    // --- grid ---------------------------------------------------------------
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.font = '11px ui-monospace, monospace';

    for (const v of niceTicks(logQMax, 5, logQMin)) {
      ctx.beginPath();
      ctx.moveTo(X(v), pad.t);
      ctx.lineTo(X(v), pad.t + ph);
      ctx.stroke();
    }
    for (const v of niceTicks(eMax, 4, eMin)) {
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(v));
      ctx.lineTo(pad.l + pw, Y(v));
      ctx.stroke();
      ctx.fillStyle = c.label;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      // Four decimals rather than three: over a one-decade window the potential
      // moves by hundredths of a volt, and 1.104 / 1.104 / 1.105 is an axis
      // that repeats itself.
      ctx.fillText(fmt(v, 4), pad.l - 6, Y(v));
    }

    // --- axes ---------------------------------------------------------------
    ctx.strokeStyle = c.axis;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + ph);
    ctx.lineTo(pad.l + pw, pad.t + ph);
    ctx.stroke();

    ctx.fillStyle = c.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of niceTicks(logQMax, 5, logQMin)) {
      ctx.fillText(fmt(v, 3), X(v), pad.t + ph + 6);
    }

    // --- E = 0, the line the crossing is read against ------------------------
    // Only when it is on screen. Drawing it off-canvas would be harmless; the
    // point is that when the crossing is absent the axis does not carry a guide
    // implying the reader should be measuring against it.
    if (line.zeroCrossing != null) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = c.eq;
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(0));
      ctx.lineTo(pad.l + pw, Y(0));
      ctx.stroke();
      ctx.restore();
    }

    // --- the line -----------------------------------------------------------
    ctx.strokeStyle = c.curve;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = X(points[i].logQ);
      const y = Y(points[i].e);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // --- the crossing, when the range reaches it ----------------------------
    if (line.zeroCrossing != null) {
      const x = X(line.zeroCrossing);
      ctx.fillStyle = c.eq;
      ctx.beginPath();
      ctx.arc(x, Y(0), 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = c.label;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(
        t('electro.crossingLabel', { logQ: fmt(line.zeroCrossing, 3) }),
        x + 6, Y(0) - 6,
      );
    }

    // --- the cell's own operating point --------------------------------------
    const op = line.operatingPoint;
    if (op.logQ >= logQMin && op.logQ <= logQMax) {
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = c.point;
      ctx.beginPath();
      ctx.moveTo(X(op.logQ), pad.t);
      ctx.lineTo(X(op.logQ), pad.t + ph);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = c.point;
      ctx.beginPath();
      ctx.arc(X(op.logQ), Y(op.e), 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = c.label;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(
        t('electro.operatingLabel', { e: fmt(op.e, 3) }),
        X(op.logQ) + 6, Y(op.e) + 6,
      );
    }

    // --- labels -------------------------------------------------------------
    ctx.fillStyle = c.label;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('lg Q', pad.l + pw / 2, height - 4);
    ctx.save();
    ctx.translate(12, pad.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'top';
    ctx.fillText(t('electro.axisPotential'), 0, 0);
    ctx.restore();

    return undefined;
  }, [line, width, height, c, t]);

  if (!line?.points?.length) return null;

  return (
    <figure className="chart-figure">
      <canvas
        ref={ref}
        className="curve-canvas"
        role="img"
        aria-label={t('electro.nernstChartLabel', {
          e0: fmt(line.e0, 4), n: line.n, temp: fmt(line.tempK - 273.15, 0),
        })}
      />
      {/* Two captions, because the chart shows one of two different things.
          Promising a crossing the axis cannot reach would be a caption that
          describes a picture the reader is not looking at. */}
      <figcaption>
        {line.zeroCrossing != null
          ? t('electro.nernstCaption')
          : t('electro.nernstCaptionNoCrossing', { logK: fmt(line.zeroCrossingAt, 1) })}
      </figcaption>
    </figure>
  );
}
