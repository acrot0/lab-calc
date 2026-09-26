import React from 'react';
import { Diagram, Axis, linePath, scale, PLOT } from '../Diagram.jsx';
import { useI18n } from '../../LocaleContext.jsx';

/**
 * Why a serial dilution falls off a cliff, and why that is the point.
 *
 * The common mistake is to expect the concentration to drop by the dilution
 * factor per step and then be surprised by how fast it reaches nothing. It is
 * exponential: after k steps the concentration is C₀ / f^k, so a 1:10 series
 * loses a factor of ten per tube and crosses from measurable to unmeasurable
 * between two adjacent tubes.
 *
 * One panel, two curves, and the comparison is the lesson. The linear one
 * looks like the series stops existing after a few tubes. The logarithmic one
 * is a straight line, and a straight line on a log axis *means* a constant
 * ratio — that is the fact worth seeing rather than being told.
 *
 * Two axes on one plot rather than two plots side by side: the x axis is
 * shared, and putting them together is what makes the shapes comparable. The
 * log values are drawn on the same frame by mapping them through their own
 * domain, which is why each curve carries its own scale.
 */
export default function DilutionDiagram({ factor = 10, steps = 8, theme }) {
  const { t } = useI18n();

  const f = Number.isFinite(factor) && factor > 1 ? factor : 10;
  const n = Number.isFinite(steps) && steps >= 1 ? Math.min(Math.round(steps), 12) : 8;

  /**
   * Tube k holds c0 / f^k, from the stock (k = 0) through tube n.
   *
   * Normalised to the stock = 1. The absolute value is not what the figure is
   * about — the shape of the decay is — and plotting it absolutely means a
   * 1000 mM stock compresses every tube below the first onto the axis, hiding
   * exactly the part worth seeing. The y axis is labelled as relative to the
   * stock for this reason.
   */
  const series = Array.from({ length: n + 1 }, (_, k) => ({ x: k, y: 1 / f ** k }));

  const linearDomain = [0, 1];
  // A tube at 1e-12 of the stock is below any real measurement, and log10(0)
  // is -Infinity, which would break the path rather than truncate it.
  const logDomain = [Math.floor(Math.log10(1 / f ** n)), 0];
  const logSeries = series
    .filter((p) => p.y > 0)
    .map((p) => ({ x: p.x, y: Math.log10(p.y) }));

  /**
   * The first tube the linear view cannot distinguish from zero.
   *
   * "Cannot distinguish" is 2% of the tallest bar on the axis, not 2% of the
   * stock — the axis is what the reader is looking at. With a 1:10 series the
   * answer is the third tube (1% of the stock), which is the point the linear
   * view stops being useful; phrasing it against the stock instead made the
   * annotation claim the curve vanished at tube 1, which is visibly false.
   *
   * Reported as "from tube k on", so the label reads as a threshold rather
   * than as a count of visible tubes.
   */
  const flatFrom = series.find((p, i) => i > 0 && p.y < 0.02)?.x ?? null;

  return (
    <Diagram
      label={t('diagram.dilution.label')}
      caption={t('diagram.dilution.caption', { factor: f, steps: n })}
      exportName="serial-dilution"
      theme={theme}
    >
      <Axis
        xDomain={[0, n]}
        yDomain={linearDomain}
        xTicks={Math.min(n + 1, 7)}
        yTicks={4}
        xLabel={t('diagram.dilution.xAxis')}
        yLabel={t('diagram.dilution.yAxis')}
        format={(v) => (v >= 1 ? v.toFixed(0) : v.toFixed(2))}
      />

      {/* The linear view. */}
      <path
        className="diagram-line"
        d={linePath(series, [0, n], linearDomain)}
      />

      {/* The log view, same frame, its own vertical scale. Dashed so the two
          are not read as one series. */}
      <path
        className="diagram-line diagram-line-alt"
        d={linePath(logSeries, [0, n], logDomain)}
      />

      {/* Marks the first tube the linear view cannot separate from zero. */}
      {flatFrom !== null && flatFrom < n && (
        <g className="diagram-note">
          <line
            x1={scale(flatFrom, [0, n], [PLOT.left, PLOT.right])}
            y1={PLOT.top}
            x2={scale(flatFrom, [0, n], [PLOT.left, PLOT.right])}
            y2={PLOT.bottom}
          />
          <text
            x={scale(flatFrom, [0, n], [PLOT.left, PLOT.right]) + 5}
            y={PLOT.top + 11}
          >
            {t('diagram.dilution.vanishes', { n: flatFrom })}
          </text>
        </g>
      )}

      {/* A key, since two curves on one frame need naming. Placed in the
          empty lower-right, which is where the linear curve leaves space. */}
      <g className="diagram-key">
        <line x1={PLOT.right - 118} y1={PLOT.bottom - 30} x2={PLOT.right - 96} y2={PLOT.bottom - 30} className="diagram-line" />
        <text x={PLOT.right - 90} y={PLOT.bottom - 26}>
          {t('diagram.dilution.linearKey')}
        </text>
        <line x1={PLOT.right - 118} y1={PLOT.bottom - 12} x2={PLOT.right - 96} y2={PLOT.bottom - 12} className="diagram-line diagram-line-alt" />
        <text x={PLOT.right - 90} y={PLOT.bottom - 8}>
          {t('diagram.dilution.logKey')}
        </text>
      </g>
    </Diagram>
  );
}
