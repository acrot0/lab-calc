import React from 'react';
import { Diagram, Axis, linePath, scale, Note, PLOT } from '../Diagram.jsx';
import { useI18n } from '../../LocaleContext.jsx';

/**
 * Why a buffer resists pH change, drawn.
 *
 * The formula on the tab is pH = pKa + log([A⁻]/[HA]). What it does not say is
 * why the middle of that curve is flat, and the flat part is the entire point
 * of a buffer — a solution whose pH barely moves when acid or base is added.
 *
 * The figure plots pH against the fraction of acid that has been deprotonated.
 * At the ends the curve climbs steeply: almost all the acid is in one form, so
 * a small addition shifts the ratio sharply. Through the middle it is nearly
 * flat, because the ratio changes slowly while both forms are present in
 * quantity. The flat band is shaded, and it is exactly the pKa ± 1 window the
 * buffer tab warns about.
 *
 * This is the Henderson-Hasselbalch equation plotted as a function of
 * composition rather than described, which is the difference between a reader
 * believing the buffering range and a reader seeing why it is where it is.
 */
export default function BufferDiagram({ pka = 4.76 }) {
  const { t } = useI18n();

  // pH = pKa + log10(f / (1 - f)), the same equation the tab computes with.
  // Sampled densely near the ends, where the curve is steepest and a uniform
  // step would leave a visible kink.
  const points = [];
  for (let i = 0; i <= 100; i++) {
    const f = i / 100;
    if (f <= 0 || f >= 1) continue;
    points.push({ x: f, y: pka + Math.log10(f / (1 - f)) });
  }

  const xDomain = [0, 1];
  const yDomain = [pka - 3, pka + 3];

  // The pKa ± 1 window, where the buffer actually works. Drawn as a band rather
  // than two lines because the claim is about the region between them.
  const bandTop = scale(pka + 1, yDomain, [PLOT.bottom, PLOT.top]);
  const bandBottom = scale(pka - 1, yDomain, [PLOT.bottom, PLOT.top]);
  const halfX = scale(0.5, xDomain, [PLOT.left, PLOT.right]);
  const pkaY = scale(pka, yDomain, [PLOT.bottom, PLOT.top]);

  return (
    <Diagram
      label={t('diagram.buffer.label')}
      caption={t('diagram.buffer.caption', { pka })}
    >
      {/* The working range, behind everything. */}
      <rect
        className="diagram-band"
        x={PLOT.left}
        y={bandTop}
        width={PLOT.right - PLOT.left}
        height={bandBottom - bandTop}
      />

      <Axis
        xDomain={xDomain}
        yDomain={yDomain}
        xTicks={5}
        yTicks={5}
        xLabel={t('diagram.buffer.xAxis')}
        yLabel={t('diagram.buffer.yAxis')}
        format={(v) => (v <= 1 && v >= 0 ? v.toFixed(1) : v.toFixed(1))}
      />

      {/* The curve. */}
      <path
        className="diagram-line"
        d={linePath(points, xDomain, yDomain)}
      />

      {/* Half-deprotonated: the ratio is 1, the log term is zero, pH = pKa. */}
      <line
        className="diagram-guide"
        x1={halfX}
        y1={PLOT.bottom}
        x2={halfX}
        y2={pkaY}
      />
      <Note x={halfX} y={pkaY} anchor="end">
        {t('diagram.buffer.halfPoint', { pka })}
      </Note>

      {/* Where the band starts and ends, so the ±1 is visible rather than
          asserted. */}
      <text
        x={PLOT.right - 6}
        y={bandTop + 12}
        textAnchor="end"
        className="diagram-band-label"
      >
        {t('diagram.buffer.upper', { ph: (pka + 1).toFixed(1) })}
      </text>
      <text
        x={PLOT.right - 6}
        y={bandBottom - 5}
        textAnchor="end"
        className="diagram-band-label"
      >
        {t('diagram.buffer.lower', { ph: (pka - 1).toFixed(1) })}
      </text>
    </Diagram>
  );
}
