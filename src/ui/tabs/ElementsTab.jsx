import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ELEMENTS, elementBySymbol, categoryOf, blockOf,
  ELEMENT_CATEGORIES, CATEGORY_COLOR,
} from '../../calc/elements.mjs';
import { fmt } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';

/**
 * Interactive periodic table.
 *
 * The grid is drawn from the data's own group/period coordinates rather than a
 * hand-written layout, so the two can never disagree — a hardcoded table drifts
 * the moment an element is corrected.
 *
 * Grid arithmetic, and why every coordinate is offset by one:
 *   column 1        the gutter holding period numbers and the f-block labels
 *   columns 2-19    groups 1-18, so a cell sits at gridColumn group + 1
 *   row 1           the group numbers
 *   rows 2-8        periods 1-7, so a cell sits at gridRow period + 1
 *   row 9           deliberately empty: that gap is what detaches the f-block
 *   rows 10-11      periods 9-10, the lanthanides and actinides
 *
 * Category and block come from the data module rather than being re-derived
 * here, because a second copy of a rule is a second thing to get wrong — the
 * positional rule that used to live in this file mislabelled thirteen elements.
 */

/** What the cell background is keyed off. */
const COLOR_BY = ['category', 'block', 'mass', 'rcow', 'rvdw'];

/** The numeric properties, and their range across the whole table. */
const NUMERIC_KEYS = ['mass', 'rcow', 'rvdw'];

const BLOCK_COLOR = { s: '#ff8f6b', p: '#4ea1ff', d: '#9db4cc', f: '#e08fc0' };
const BLOCKS = ['s', 'p', 'd', 'f'];

/** Sequential ramp for the numeric properties; returns 0-1. */
function heat(el, key, range) {
  const v = el[key];
  if (!Number.isFinite(v) || range.max === range.min) return 0.5;
  return (v - range.min) / (range.max - range.min);
}

/** Heat colour: 200° (blue) at the low end, 0° (red) at the high end. */
function hueOf(h) {
  return 200 - h * 200;
}

/**
 * Cell background and border for a colour, at fill and border strength.
 *
 * Category and block colours are hex, so the alpha rides along as a suffix; the
 * heat ramp is an hsl() string, which needs the alpha inside the parentheses
 * instead. One helper for both so the legend and the cells cannot drift.
 */
function tinted(color) {
  if (color.startsWith('#')) {
    return { background: `${color}33`, borderColor: `${color}88` };
  }
  return {
    background: color.replace(')', ' / 0.22)'),
    borderColor: color.replace(')', ' / 0.6)'),
  };
}

export default function ElementsTab() {
  const { t } = useI18n();
  const [colorBy, setColorBy] = useState('category');
  const [selected, setSelected] = useState(() => elementBySymbol('Na'));
  const [query, setQuery] = useState('');
  const gridRef = useRef(null);

  const ranges = useMemo(() => {
    const out = {};
    for (const key of NUMERIC_KEYS) {
      const vals = ELEMENTS.map((e) => e[key]).filter((v) => Number.isFinite(v) && v > 0);
      out[key] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
    return out;
  }, []);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return null;
    return new Set(
      ELEMENTS.filter((e) =>
        e.symbol.toLowerCase().includes(q)
        || e.name.toLowerCase().includes(q)
        || e.zh.includes(query.trim())
        || String(e.number) === q)
        .map((e) => e.symbol),
    );
  }, [query]);

  /** Bring the first search hit into view once, when the query settles. */
  useEffect(() => {
    if (!matched || matched.size === 0) return;
    const first = ELEMENTS.find((e) => matched.has(e.symbol));
    gridRef.current?.querySelector(`[data-symbol="${first.symbol}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [matched]);

  /**
   * Arrow-key navigation across the grid.
   *
   * Tab alone means 118 stops to reach the far end. Moving by group and period
   * follows the layout the eye already reads, and it steps over the unoccupied
   * cells — the gap between groups 2 and 3, and the empty row 9 — which would
   * otherwise swallow a keypress with no visible response.
   */
  function onKeyDown(e) {
    const delta = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    }[e.key];
    if (!delta || !selected) return;
    const [dGroup, dPeriod] = delta;

    const cur = selected;
    const candidates = ELEMENTS.filter((el) => {
      if (el.symbol === cur.symbol) return false;
      if (dPeriod !== 0) {
        return dPeriod > 0 ? el.period > cur.period : el.period < cur.period;
      }
      return el.period === cur.period
        && (dGroup > 0 ? el.group > cur.group : el.group < cur.group);
    });
    if (candidates.length === 0) return;
    e.preventDefault();

    // Nearest in the direction of travel, then nearest on the other axis, so
    // the cursor lands somewhere the eye can follow rather than jumping.
    const key = dPeriod !== 0
      ? (el) => [Math.abs(el.period - cur.period), Math.abs(el.group - cur.group)]
      : (el) => [Math.abs(el.group - cur.group), Math.abs(el.period - cur.period)];
    candidates.sort((a, b) => {
      const [a1, a2] = key(a);
      const [b1, b2] = key(b);
      return a1 - b1 || a2 - b2;
    });

    const next = candidates[0];
    setSelected(next);
    gridRef.current?.querySelector(`[data-symbol="${next.symbol}"]`)?.focus();
  }

  /** Inline style for one cell: background follows the chosen colouring. */
  function cellStyle(el) {
    if (colorBy === 'category') return tinted(CATEGORY_COLOR[categoryOf(el)]);
    if (colorBy === 'block') return tinted(BLOCK_COLOR[blockOf(el)]);
    // Same ramp as the legend, so the two cannot drift apart.
    return tinted(`hsl(${hueOf(heat(el, colorBy, ranges[colorBy]))} 72% 52%)`);
  }

  const dim = (el) => (matched && !matched.has(el.symbol) ? ' is-dim' : '');

  const cat = selected ? categoryOf(selected) : null;
  const blk = selected ? blockOf(selected) : null;

  return (
    <div className="card">
      <div className="row">
        <div className="field">
          <label htmlFor="el-color">{t('elements.colorBy')}</label>
          <select id="el-color" value={colorBy} onChange={(e) => setColorBy(e.target.value)}>
            {COLOR_BY.map((k) => <option key={k} value={k}>{t(`elements.by_${k}`)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="el-search">{t('elements.search')}</label>
          <input
            id="el-search"
            type="search"
            value={query}
            placeholder={t('elements.searchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* The key. Without it the colouring is decorative: a reader can see that
          the table is shaded but not what any shade means. */}
      <div className="legend" aria-hidden="true">
        {colorBy === 'category' && ELEMENT_CATEGORIES.map((c) => (
          <span className="legend-item" key={c}>
            <span className="legend-sw" style={{ background: CATEGORY_COLOR[c] }} />
            {t(`elements.cat_${c}`)}
          </span>
        ))}
        {colorBy === 'block' && BLOCKS.map((b) => (
          <span className="legend-item" key={b}>
            <span className="legend-sw" style={{ background: BLOCK_COLOR[b] }} />
            {t(`elements.block_${b}`)}
          </span>
        ))}
        {NUMERIC_KEYS.includes(colorBy) && (
          <>
            <span className="legend-item">{fmt(ranges[colorBy].min, 3)}</span>
            <span className="legend-ramp" />
            <span className="legend-item">{fmt(ranges[colorBy].max, 3)}</span>
            <span className="legend-item legend-unit">
              {t(`elements.unit_${colorBy}`)}
            </span>
          </>
        )}
      </div>

      <div className="ptable-wrap">
        <div className="ptable" role="grid" aria-label={t('elements.tableLabel')} ref={gridRef} onKeyDown={onKeyDown}>
          {/* Group numbers along the top, period numbers down the left. */}
          {Array.from({ length: 18 }, (_, i) => (
            <span className="paxis paxis-group" key={`g${i + 1}`} style={{ gridColumn: i + 2, gridRow: 1 }}>
              {i + 1}
            </span>
          ))}
          {[1, 2, 3, 4, 5, 6, 7].map((p) => (
            <span className="paxis paxis-period" key={`p${p}`} style={{ gridColumn: 1, gridRow: p + 1 }}>
              {p}
            </span>
          ))}
          {/* The detached rows are labelled by name, not by period: 9 and 10
              are this table's internal coordinates and mean nothing to a reader. */}
          <span className="paxis paxis-f" style={{ gridColumn: 1, gridRow: 10 }}>
            {t('elements.cat_lanthanide')}
          </span>
          <span className="paxis paxis-f" style={{ gridColumn: 1, gridRow: 11 }}>
            {t('elements.cat_actinide')}
          </span>

          {ELEMENTS.map((el, idx) => (
            <button
              key={el.symbol}
              type="button"
              role="gridcell"
              data-symbol={el.symbol}
              // One tab stop for the whole grid; arrows move within it.
              tabIndex={selected?.symbol === el.symbol ? 0 : -1}
              className={`pcell${dim(el)}${selected?.symbol === el.symbol ? ' is-on' : ''}`}
              // --i drives the staggered entrance; it is capped so the last
              // element does not arrive visibly late behind the first.
              style={{
                gridColumn: el.group + 1,
                gridRow: el.period + 1,
                '--i': Math.min(idx, 40),
                ...cellStyle(el),
              }}
              aria-label={`${el.number} ${el.symbol} ${el.zh}`}
              aria-pressed={selected?.symbol === el.symbol}
              onClick={() => setSelected(el)}
            >
              <span className="pcell-z">{el.number}</span>
              <span className="pcell-sym">{el.symbol}</span>
              <span className="pcell-name">{el.zh}</span>
            </button>
          ))}
        </div>
      </div>

      {matched && matched.size === 0 && (
        <div className="hint">{t('elements.noMatch', { query })}</div>
      )}
      {matched && matched.size > 0 && (
        <div className="hint">{t('elements.matchCount', { count: matched.size })}</div>
      )}

      {selected && (
        <div className="result" role="status" aria-live="polite">
          <div className="result-main">
            {selected.symbol}
            <span className="unit">{selected.zh}</span>
          </div>
          <div className="result-note">
            {selected.name} · {t('elements.number')} {selected.number} ·{' '}
            {t('elements.period')} {selected.period} · {t('elements.group')} {selected.group} ·{' '}
            {t(`elements.block_${blk}`)}
          </div>
          <div className="result-grid">
            <div>
              <span>{t('elements.mass')}</span>
              <strong>{fmt(selected.mass, 4)} g/mol</strong>
            </div>
            <div>
              <span>{t('elements.rcow')}</span>
              <strong>{fmt(selected.rcow, 3)} Å</strong>
            </div>
            <div>
              <span>{t('elements.rvdw')}</span>
              <strong>{fmt(selected.rvdw, 3)} Å</strong>
            </div>
            <div>
              <span>{t('elements.category')}</span>
              <strong>{t(`elements.cat_${cat}`)}</strong>
            </div>
          </div>
          <div className="hint">
            {t('elements.massSourceNote', {
              source: t(`elements.source_${selected.massSource}`),
            })}
          </div>
        </div>
      )}
    </div>
  );
}