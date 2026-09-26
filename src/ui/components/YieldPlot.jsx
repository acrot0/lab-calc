import React, { useEffect, useRef, useMemo } from 'react';
import { useI18n } from '../LocaleContext.jsx';
import { chartColors } from '../chart-colors.mjs';
import { niceTicks } from './chart-axis.mjs';
import { fmt, fmtSci } from '../format.mjs';

/**
 * Product mass against how much of one reactant is supplied.
 *
 * ## Why this is drawn rather than tabulated
 *
 * The numbers the tab already prints answer "how much do I get", and they
 * answer it correctly. What they cannot answer is the question behind the most
 * common mistake in a stoichiometry exercise: *would more of this help?* The
 * answer is a plateau, and a plateau is invisible in a single row of results —
 * a yield that stops responding to its input just looks like a number.
 *
 * Swept, the answer becomes a wedge with a corner. Rising while the varied
 * reactant is the limiting one, flat once the others are. The corner sits at
 * the balanced ratio, so the chart states the stoichiometry geometrically:
 * 4 Fe to 3 O₂ is not a fact to memorise, it is where the line bends.
 *
 * ## Why the corner is drawn, not just implied
 *
 * A reader can find a corner by eye, but "by eye" is how the ratio gets read as
 * 1:1. The dashed lines run to both axes so the stoichiometric amount and the
 * yield ceiling are both readable as numbers, and the label names the ratio the
 * balanced equation gave.
 *
 * ## The two colours are the two regimes
 *
 * The rising and flat runs are drawn in different colours because they are
 * different answers to the same question — "add more" versus "stop" — and a
 * single-colour line would make the reader find the transition to know which
 * they are in. This is the one place a categorical palette is right: the two
 * segments are categories, not a gradient.
 */
export default function YieldPlot({ sweep, theme = 'dark', width = 520, height = 260 }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const c = useMemo(() => chartColors(theme), [theme]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !sweep?.points?.length) return undefined;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 62, r: 16, t: 16, b: 40 };
    const pw = width - pad.l - pad.r;
    const ph = height - pad.t - pad.b;

    const { points, cornerMoles, maxMassProduct } = sweep;
    const xMax = points[points.length - 1].molesVary;
    // A little headroom above the ceiling so the flat run is visibly flat
    // rather than lying along the top edge, where it reads as clipped.
    const yMax = maxMassProduct * 1.12;

    const X = (m) => pad.l + (m / xMax) * pw;
    const Y = (g) => pad.t + ph - (g / yMax) * ph;

    // --- grid ---------------------------------------------------------------
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = c.label;

    for (const m of niceTicks(xMax, 5)) {
      ctx.beginPath();
      ctx.moveTo(X(m), pad.t);
      ctx.lineTo(X(m), pad.t + ph);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(fmt(m, 3), X(m), pad.t + ph + 6);
    }

    for (const g of niceTicks(yMax, 4)) {
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(g));
      ctx.lineTo(pad.l + pw, Y(g));
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmt(g, 3), pad.l - 6, Y(g));
    }

    // --- axes ---------------------------------------------------------------
    ctx.strokeStyle = c.axis;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + ph);
    ctx.lineTo(pad.l + pw, pad.t + ph);
    ctx.stroke();

    // --- axis titles --------------------------------------------------------
    ctx.fillStyle = c.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${sweep.varyOf} (mol)`, pad.l + pw / 2, height - 2);

    ctx.save();
    ctx.translate(12, pad.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'top';
    ctx.fillText(`${sweep.yieldOf} (g)`, 0, 0);
    ctx.restore();

    // --- the corner ---------------------------------------------------------
    if (cornerMoles > 0 && cornerMoles <= xMax) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = c.eq;
      ctx.beginPath();
      ctx.moveTo(X(cornerMoles), pad.t);
      ctx.lineTo(X(cornerMoles), pad.t + ph);
      ctx.moveTo(pad.l, Y(maxMassProduct));
      ctx.lineTo(X(cornerMoles), Y(maxMassProduct));
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = c.label;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(
        t('reaction.plotCorner', { n: fmt(sweep.cornerRatio, 2), formula: sweep.varyOf }),
        X(cornerMoles) + 5,
        pad.t + ph - 5,
      );
    }

    // --- the two runs -------------------------------------------------------
    /*
     * Drawn as two polylines rather than one, split at the corner. One path
     * would need a gradient to change colour mid-line, and a gradient implies
     * the quantity is continuous across the boundary — the opposite of what
     * this chart is saying.
     */
    const draw = (from, to, colour) => {
      if (to < from) return;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const p = points[i];
        const x = X(p.molesVary);
        const y = Y(p.massProduct);
        if (i === from) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    // The index of the first point at or past the corner.
    let cornerIdx = points.findIndex((p) => p.molesVary >= cornerMoles);
    if (cornerIdx < 0) cornerIdx = points.length - 1;

    draw(0, cornerIdx, c.curve);
    draw(cornerIdx, points.length - 1, c.fit);

    // --- the corner marker --------------------------------------------------
    const cp = points[cornerIdx];
    ctx.fillStyle = c.curve;
    ctx.beginPath();
    ctx.arc(X(cp.molesVary), Y(cp.massProduct), 4, 0, Math.PI * 2);
    ctx.fill();
  }, [sweep, c, t, width, height]);

  if (!sweep?.points?.length) return null;

  return (
    <figure className="chart-figure">
      <canvas
        ref={ref}
        role="img"
        aria-label={t('reaction.plotLabel', {
          vary: sweep.varyOf,
          product: sweep.yieldOf,
          // `fmtSci`, not `fmt`: a sweep of a dilute or high-molar-mass system
          // puts the corner in the micromole range, where three decimals of
          // `fmt` renders it as a flat 0.000.
          corner: fmtSci(sweep.cornerMoles, 3),
        })}
      />
      <figcaption>
        {t('reaction.plotCaption', {
          vary: sweep.varyOf,
          product: sweep.yieldOf,
          // A maximum product mass is unbounded the same way: a 1 mmol batch of
          // a heavy product is a few hundred milligrams, but the same sweep on
          // a dilute system lands below the milligram the three decimals of
          // `fmt` would round away.
          max: fmtSci(sweep.maxMassProduct, 3),
        })}
      </figcaption>
    </figure>
  );
}
