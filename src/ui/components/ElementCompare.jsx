import React, { useMemo, useCallback } from 'react';
import { ELEMENTS, elementBySymbol } from '../../calc/elements.mjs';
import { propertiesOf } from '../../calc/element-properties.mjs';
import { fmt, fmtSci } from '../format.mjs';
import {
  COMPARE_KEYS, compareAxes, compareSeries, radarRuns, pathOf, seriesColor,
} from '../compare.mjs';
import { useI18n } from '../LocaleContext.jsx';

/**
 * Radar comparison for two to four elements.
 *
 * Every axis is normalised to that property's range across the whole table, so
 * the shapes can be laid over one another. That normalisation is also the
 * chart's limitation and the reason a value table sits directly beneath it: a
 * radius says where an element sits between the smallest and largest value of
 * a property, not how large the property is. Sodium's melting point and its
 * covalent radius both reach the same distance from the centre when both are
 * the table's maximum, despite differing by four orders of magnitude.
 *
 * The chart is therefore the overview and the table is the measurement. A
 * reader who wants "which of these two has the higher boiling point" reads the
 * table; a reader who wants "is this element an outlier across the board"
 * reads the shape.
 */

/** Drawing geometry, in viewBox units. 16:9 to match the other figures. */
const VIEW = { w: 480, h: 270 };
const CENTER = { x: 240, y: 133 };
const RADIUS = 90;
/** Ring fractions, so the grid reads as a scale rather than as decoration. */
const RINGS = [0.25, 0.5, 0.75, 1];

/**
 * Where an axis label sits, and which way it reads.
 *
 * A label at the left of the circle is anchored at its end so it grows away
 * from the chart; one at the right is anchored at its start. Anchoring them
 * all at the middle would put the left and right labels half on top of the
 * spokes they name.
 */
function axisLabel(index, count) {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const anchor = Math.abs(cos) < 0.25 ? 'middle' : (cos > 0 ? 'start' : 'end');
  return {
    x: CENTER.x + (RADIUS + 14) * cos,
    y: CENTER.y + (RADIUS + 14) * sin + (Math.abs(sin) > 0.9 ? (sin < 0 ? -2 : 9) : 3),
    anchor,
  };
}

/** One formatted value, in the notation its own scale uses. */
function formatValue(value, range, t) {
  if (value === null) return t('elements.noValue');
  return range.log ? fmtSci(value, 4) : fmt(value, 4);
}

export default function ElementCompare({ symbols, onRemove, theme = 'dark' }) {
  const { t } = useI18n();
  // Okabe-Ito is built for a dark surface; on white its yellow drops to 1.32:1
  // and its orange to 2.25:1, so the fourth element in the comparison becomes
  // the hardest one to see. See SERIES_COLORS.
  const color = useCallback((i) => seriesColor(i, theme), [theme]);

  const chosen = useMemo(
    () => symbols.map((s) => elementBySymbol(s)).filter(Boolean),
    [symbols],
  );

  // The same axis definitions the periodic table's heat map uses, so a scale
  // cannot disagree between the two views of the same data.
  const axes = useMemo(
    () => compareAxes(ELEMENTS, (el) => propertiesOf(el.number), COMPARE_KEYS),
    [],
  );

  const series = useMemo(
    () => compareSeries(chosen, axes, (el) => propertiesOf(el.number)),
    [chosen, axes],
  );

  if (axes.length === 0) return null;

  if (chosen.length < 2) {
    return <div className="hint">{t('elements.compareNeed')}</div>;
  }

  const n = axes.length;
  const ringPath = (f) => pathOf(
    Array.from({ length: n }, (_, i) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      return { x: RADIUS * f * Math.cos(a), y: RADIUS * f * Math.sin(a) };
    }),
    true,
  );

  return (
    <div className="compare">
      <div className="compare-head">
        <strong>{t('elements.compare')}</strong>
        <span className="hint">{t('elements.compareHint')}</span>
      </div>

      <div className="compare-legend">
        {chosen.map((el, i) => (
          <span className="legend-item" key={el.symbol}>
            <span className="legend-sw" style={{ background: color(i) }} />
            {el.symbol} {el.zh}
            <button
              type="button"
              className="chip-x"
              onClick={() => onRemove(el.symbol)}
              aria-label={t('elements.compareRemove', { symbol: el.symbol })}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <figure className="diagram">
        <svg
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          className="diagram-svg"
          role="img"
          aria-label={t('elements.compareLabel', {
            list: chosen.map((el) => el.symbol).join(', '),
          })}
        >
          {/* The grid: one ring per quarter, plus a spoke per property. */}
          <g className="cmp-grid">
            {RINGS.map((f) => (
              <path key={f} d={ringPath(f)} transform={`translate(${CENTER.x} ${CENTER.y})`} />
            ))}
            {axes.map((ax, i) => {
              const a = (Math.PI * 2 * i) / n - Math.PI / 2;
              return (
                <line
                  key={ax.key}
                  x1={CENTER.x}
                  y1={CENTER.y}
                  x2={CENTER.x + RADIUS * Math.cos(a)}
                  y2={CENTER.y + RADIUS * Math.sin(a)}
                />
              );
            })}
          </g>

          {/* One outline per element. A run covering every axis is filled; a
              shorter run is stroked only, because filling an open path would
              invent the area it appears to enclose. */}
          {series.map((s, i) => {
            const { runs, closed } = radarRuns(s, axes, RADIUS);
            return (
              <g key={s.symbol} transform={`translate(${CENTER.x} ${CENTER.y})`}>
                {runs.map((run, ri) => (
                  <path
                    key={ri}
                    d={pathOf(run, closed)}
                    fill={closed ? color(i) : 'none'}
                    fillOpacity={closed ? 0.16 : 0}
                    stroke={color(i)}
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                  />
                ))}
                {runs.flat().map((p) => (
                  <circle key={p.key} cx={p.x} cy={p.y} r={2.4} fill={color(i)} />
                ))}
              </g>
            );
          })}

          {/* Axis names last, so they sit above the outlines rather than being
              crossed out by them. */}
          {axes.map((ax, i) => {
            const { x, y, anchor } = axisLabel(i, n);
            const unit = t(`elements.unit_${ax.key}`);
            const name = t(`elements.by_${ax.key}`);
            return (
              <g key={ax.key}>
                <text x={x} y={y} textAnchor={anchor} className="cmp-axis-name">{name}</text>
                {unit !== '' && (
                  <text x={x} y={y + 10} textAnchor={anchor} className="cmp-axis-unit">{unit}</text>
                )}
              </g>
            );
          })}
        </svg>
      </figure>

      {/* The measurement the shape only sketches. Without this the chart is
          unreadable as data: two elements an order of magnitude apart on a
          property both draw at the outer ring if both are the table's extreme. */}
      <div className="table-wrap">
        <table className="cmp-table">
          <thead>
            <tr>
              <th scope="col">{t('elements.compareProperty')}</th>
              {chosen.map((el, i) => (
                <th scope="col" key={el.symbol}>
                  <span className="legend-sw" style={{ background: color(i) }} />
                  {el.symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {axes.map((ax) => (
              <tr key={ax.key}>
                <th scope="row">
                  {t(`elements.by_${ax.key}`)}
                  {ax.range.log && <span className="cmp-log">{t('elements.logScale')}</span>}
                  {/* How much of the table this axis was drawn from. A range
                      fitted to 96 elements should not read as if it covered
                      all 118. */}
                  {ax.present < ELEMENTS.length && (
                    <span className="cmp-log">
                      {t('elements.coverage', { count: ax.present, total: ELEMENTS.length })}
                    </span>
                  )}
                </th>
                {series.map((s) => {
                  const pt = s.points.find((p) => p.key === ax.key);
                  return (
                    <td key={s.symbol}>{formatValue(pt ? pt.value : null, ax.range, t)}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="hint">{t('elements.compareScaleNote')}</div>
    </div>
  );
}
