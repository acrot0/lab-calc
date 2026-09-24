import React, { useState, useMemo } from 'react';
import { ELEMENTS, elementBySymbol } from '../../calc/elements.mjs';
import { fmt } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';

/**
 * Interactive periodic table.
 *
 * The grid is drawn from the data's own group/period coordinates rather than a
 * hand-written layout, so the two can never disagree — a hardcoded table drifts
 * the moment an element is corrected.
 *
 * The f-block sits on rows 9 and 10 with row 8 left empty; that gap is what
 * produces the conventional detached rows below the main table.
 */

/** Colour a cell by the property the user picked, as a heatmap. */
const COLOR_BY = ['category', 'mass', 'rcow', 'rvdw'];

/** Element categories, in the order they appear across the table. */
function categoryOf(el) {
  const g = el.group;
  const p = el.period;
  if (p === 9) return 'lanthanide';
  if (p === 10) return 'actinide';
  if (g === 1 && p !== 1) return 'alkali';
  if (g === 2) return 'alkaline';
  if (g === 17) return 'halogen';
  if (g === 18) return 'noble';
  if (g >= 3 && g <= 12) return 'transition';
  if (g >= 13 && g <= 16) return 'postTransition';
  // H, C, N, O, P, S, Se and the rest of the non-metals.
  return 'nonmetal';
}

/** Sequential ramp for the numeric properties; returns a hue 0-1. */
function heat(el, key, range) {
  const v = el[key];
  if (!Number.isFinite(v) || range.max === range.min) return 0.5;
  return (v - range.min) / (range.max - range.min);
}

export default function ElementsTab() {
  const { t } = useI18n();
  const [colorBy, setColorBy] = useState('category');
  const [selected, setSelected] = useState(() => elementBySymbol('Na'));
  const [query, setQuery] = useState('');

  const ranges = useMemo(() => {
    const out = {};
    for (const key of ['mass', 'rcow', 'rvdw']) {
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

  /** Inline style for one cell: background follows the chosen colouring. */
  function cellStyle(el) {
    if (colorBy === 'category') {
      return { background: `${el.color}22`, borderColor: `${el.color}66` };
    }
    const key = colorBy;
    const h = heat(el, key, ranges[key]);
    // 200° (blue) → 0° (red). Low values cool, high values hot.
    const hue = 200 - h * 200;
    return {
      background: `hsl(${hue} 70% 50% / 0.22)`,
      borderColor: `hsl(${hue} 70% 50% / 0.5)`,
    };
  }

  const dim = (el) => (matched && !matched.has(el.symbol) ? ' is-dim' : '');

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

      <div className="ptable-wrap">
        <div className="ptable" role="grid" aria-label={t('elements.tableLabel')}>
          {ELEMENTS.map((el, idx) => (
            <button
              key={el.symbol}
              type="button"
              role="gridcell"
              className={`pcell${dim(el)}${selected?.symbol === el.symbol ? ' is-on' : ''}`}
              // --i drives the staggered entrance; it is capped so the last
              // element does not arrive visibly late behind the first.
              style={{ gridColumn: el.group, gridRow: el.period, '--i': Math.min(idx, 40), ...cellStyle(el) }}
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

      {selected && (
        <div className="result" role="status" aria-live="polite">
          <div className="result-main">
            {selected.symbol}
            <span className="unit">{selected.zh}</span>
          </div>
          <div className="result-note">
            {selected.name} · {t('elements.number')} {selected.number} ·{' '}
            {t('elements.period')} {selected.period} · {t('elements.group')} {selected.group}
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
              <strong>{t(`elements.cat_${categoryOf(selected)}`)}</strong>
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
