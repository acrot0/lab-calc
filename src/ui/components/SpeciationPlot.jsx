import React, { useEffect, useRef, useMemo } from 'react';
import { useI18n } from '../LocaleContext.jsx';
import { chartColors } from '../chart-colors.mjs';
import { fmt } from '../format.mjs';
import { niceTicks } from './chart-axis.mjs';

/**
 * The distribution of an acid over its protonation states.
 *
 * ## Why the pH tab draws this
 *
 * The tab rests on `[H⁺] ≈ √(Ka·C)`, and that approximation has a domain: it
 * assumes the acid is barely dissociated. A reader who has seen the
 * distribution knows when the formula applies without being told; one who has
 * only memorised the formula does not. The tab already carries a warning
 * saying so — this is the same claim made checkable.
 *
 * Two things it shows that the formula hides: the curves cross at exactly
 * pH = pKa, and by pH = pKa + 2 the acid form is 99% gone, which is where the
 * approximation has already failed.
 *
 * ## Why the curves are coloured by rank, not by species name
 *
 * A palette has a handful of distinguishable hues and an acid can have seven
 * states. Colouring by identity would need a generator and would produce two
 * greens nobody can tell apart. The order is the information — most protonated
 * first — so the ramp follows it and the legend carries the names.
 */
export default function SpeciationPlot({
  curve, currentPh = null, theme = 'dark', width = 520, height = 260,
}) {
  const { t } = useI18n();
  const ref = useRef(null);
  const c = useMemo(() => chartColors(theme), [theme]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !curve?.points?.length) return undefined;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 46, r: 14, t: 14, b: 38 };
    const pw = width - pad.l - pad.r;
    const ph = height - pad.t - pad.b;

    const { points, phMin, phMax, pKas } = curve;
    const X = (v) => pad.l + ((v - phMin) / (phMax - phMin)) * pw;
    const Y = (f) => pad.t + ph - f * ph;

    // --- grid ---------------------------------------------------------------
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.font = '11px ui-monospace, monospace';

    for (const v of niceTicks(phMax, 5).filter((v) => v >= phMin)) {
      ctx.beginPath();
      ctx.moveTo(X(v), pad.t);
      ctx.lineTo(X(v), pad.t + ph);
      ctx.stroke();
    }
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(f));
      ctx.lineTo(pad.l + pw, Y(f));
      ctx.stroke();
      ctx.fillStyle = c.label;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmt(f, 3), pad.l - 6, Y(f));
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
    for (const v of niceTicks(phMax, 5).filter((v) => v >= phMin)) {
      ctx.fillText(fmt(v, 3), X(v), pad.t + ph + 6);
    }

    // --- the pKa guides -----------------------------------------------------
    /*
     * Drawn before the curves so a curve crosses over them rather than the
     * other way round. Each one is where two adjacent species are equal, which
     * is the reading a student is usually after.
     */
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = c.eq;
    for (const pKa of pKas) {
      if (pKa < phMin || pKa > phMax) continue;
      ctx.beginPath();
      ctx.moveTo(X(pKa), pad.t);
      ctx.lineTo(X(pKa), pad.t + ph);
      ctx.stroke();
    }
    ctx.restore();

    // --- the species --------------------------------------------------------
    const count = curve.species.length;
    for (let s = 0; s < count; s++) {
      ctx.strokeStyle = speciesInk(c, s, count);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const x = X(points[i].ph);
        const y = Y(points[i].fractions[s] ?? 0);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // --- where the tab's own calculation sits -------------------------------
    if (currentPh != null && currentPh >= phMin && currentPh <= phMax) {
      ctx.save();
      ctx.strokeStyle = c.point;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(currentPh), pad.t);
      ctx.lineTo(X(currentPh), pad.t + ph);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = c.label;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`pH ${fmt(currentPh, 2)}`, X(currentPh) + 4, pad.t + 2);
    }

    // --- labels -------------------------------------------------------------
    ctx.fillStyle = c.label;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('pH', pad.l + pw / 2, height - 4);
    ctx.save();
    ctx.translate(12, pad.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'top';
    ctx.fillText(t('ph.axisFraction'), 0, 0);
    ctx.restore();

    return undefined;
  }, [curve, currentPh, width, height, c, t]);

  if (!curve?.points?.length) return null;

  return (
    <figure className="chart-figure">
      <canvas
        ref={ref}
        className="curve-canvas"
        role="img"
        aria-label={t('ph.speciationLabel', {
          species: curve.species.join(' / '),
          lo: fmt(curve.phMin, 2),
          hi: fmt(curve.phMax, 2),
        })}
      />
      {/* The legend is markup rather than canvas text: it stays readable at any
          zoom and is reachable by a screen reader, neither of which a label
          painted into the bitmap is. */}
      <ul className="chart-legend">
        {curve.species.map((name, i) => (
          <li className="legend-item" key={name}>
            <span
              className="legend-sw-line"
              style={{ background: speciesInk(c, i, curve.species.length) }}
            />
            {name}
          </li>
        ))}
      </ul>
      <figcaption>{t('ph.speciationCaption')}</figcaption>
    </figure>
  );
}

/**
 * A hue per species, spread across the palette's accent by rank.
 *
 * Derived from tokens rather than added as palette entries, so a theme added
 * later gets correct curves by existing — the same reason `chart-colors.mjs`
 * derives instead of storing.
 */
function speciesInk(c, index, count) {
  if (count === 1) return c.curve;
  // 1.0 down to 0.45, so the most protonated form is the most solid and the
  // sequence reads as a direction rather than a set.
  return mix(c.curve, c.label, (index / (count - 1)) * 0.55);
}

/**
 * Linear blend between two palette colours.
 *
 * Both ends have to be hex. `gridLine` is deliberately not one of them: it is
 * an `rgba()` string on some palettes and a hex on others, so parsing it would
 * silently produce `NaN` channels on half the themes — a curve drawn in
 * `rgb(NaN, NaN, NaN)`, which the canvas ignores entirely and which looks
 * exactly like a curve that was never plotted.
 */
function mix(a, b, t) {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const ch = (i) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

function parseHex(v) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(v).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
