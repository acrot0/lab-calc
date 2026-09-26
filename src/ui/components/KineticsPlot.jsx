import React, { useEffect, useRef, useMemo } from 'react';
import { useI18n } from '../LocaleContext.jsx';
import { chartColors } from '../chart-colors.mjs';
import { niceTicks } from './chart-axis.mjs';
import { fmt } from '../format.mjs';

/**
 * The Michaelis–Menten curve with its data points.
 *
 * ## Why this is drawn rather than tabulated
 *
 * `michaelisMenten` returns Vmax, Km and r², and a table of those three numbers
 * cannot show the thing that matters most about an enzyme assay: whether the
 * substrate range actually brackets Km. A fit from five points all far below Km
 * produces confident-looking parameters from data that contains almost no
 * information about Vmax — the curve is still climbing and the asymptote is
 * extrapolated. Plotting the points against the fitted curve makes that visible
 * in a glance and invisible in a table.
 *
 * ## Why the points are drawn on the curve, not beside it
 *
 * Each measurement is a vertical distance from the fitted line, and that
 * distance *is* the residual. Drawing them as a scatter beside a separate line
 * chart would make the reader do the comparison in their head.
 */
export default function KineticsPlot({ points, fit, theme = 'dark', width = 520, height = 260 }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const c = useMemo(() => chartColors(theme), [theme]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !fit || !points?.length) return undefined;

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

    // The x range covers the data with a little air; the y range reaches to
    // Vmax so the asymptote the fit claims is actually on screen.
    const sMax = Math.max(...points.map((p) => p.s));
    const vMax = Math.max(fit.vmax, ...points.map((p) => p.v));
    const xMax = sMax * 1.08;
    const yMax = vMax * 1.12;

    const X = (s) => pad.l + (s / xMax) * pw;
    const Y = (v) => pad.t + ph - (v / yMax) * ph;

    // --- grid ---------------------------------------------------------------
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = c.label;

    const xTicks = niceTicks(xMax, 5);
    for (const s of xTicks) {
      ctx.beginPath();
      ctx.moveTo(X(s), pad.t);
      ctx.lineTo(X(s), pad.t + ph);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(fmt(s, 3), X(s), pad.t + ph + 6);
    }

    const yTicks = niceTicks(yMax, 4);
    for (const v of yTicks) {
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(v));
      ctx.lineTo(pad.l + pw, Y(v));
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmt(v, 3), pad.l - 6, Y(v));
    }

    // --- axes ---------------------------------------------------------------
    ctx.strokeStyle = c.axis;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + ph);
    ctx.lineTo(pad.l + pw, pad.t + ph);
    ctx.stroke();

    // --- the Km marker ------------------------------------------------------
    /*
     * Km is the substrate concentration at half Vmax, and it is the number the
     * whole experiment is usually for. Marking it on the axes shows whether it
     * falls inside the measured range — the check the parameters alone cannot
     * express.
     */
    if (fit.km > 0 && fit.km <= xMax) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = c.eq;
      ctx.beginPath();
      ctx.moveTo(X(fit.km), Y(fit.vmax / 2));
      ctx.lineTo(X(fit.km), pad.t + ph);
      ctx.moveTo(pad.l, Y(fit.vmax / 2));
      ctx.lineTo(X(fit.km), Y(fit.vmax / 2));
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = c.label;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Km ${fmt(fit.km, 3)}`, X(fit.km) + 4, pad.t + ph - 4);
    }

    // --- Vmax asymptote -----------------------------------------------------
    ctx.save();
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = c.eq;
    ctx.beginPath();
    ctx.moveTo(pad.l, Y(fit.vmax));
    ctx.lineTo(pad.l + pw, Y(fit.vmax));
    ctx.stroke();
    ctx.restore();

    // --- the fitted curve ---------------------------------------------------
    ctx.strokeStyle = c.curve;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const s = (i / steps) * xMax;
      const v = (fit.vmax * s) / (fit.km + s);
      const x = X(s);
      const y = Y(v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // --- the measurements ---------------------------------------------------
    for (const p of points) {
      const x = X(p.s);
      const y = Y(p.v);
      // A vertical tie from the point to the curve: that segment is the
      // residual, and seeing it is the point of drawing the data at all.
      const fitted = Y((fit.vmax * p.s) / (fit.km + p.s));
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, fitted);
      ctx.stroke();

      ctx.fillStyle = c.point;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- axis labels --------------------------------------------------------
    ctx.fillStyle = c.label;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(t('bio.axisSubstrate'), pad.l + pw / 2, height - 4);
    ctx.save();
    ctx.translate(12, pad.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'top';
    ctx.fillText(t('bio.axisRate'), 0, 0);
    ctx.restore();

    return undefined;
  }, [points, fit, width, height, c, t]);

  if (!fit || !points?.length) return null;

  return (
    <figure className="chart-figure">
      <canvas
        ref={ref}
        className="kinetics-canvas"
        role="img"
        aria-label={t('bio.kineticsChartLabel', {
          vmax: fmt(fit.vmax, 3), km: fmt(fit.km, 3), n: points.length,
        })}
      />
      <figcaption>{t('bio.kineticsCaption')}</figcaption>
    </figure>
  );
}
