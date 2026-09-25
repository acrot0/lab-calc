import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ELEMENTS, elementBySymbol, categoryOf, blockOf, periodOf, isFBlock,
  ELEMENT_CATEGORIES,
} from '../../calc/elements.mjs';
import {
  ELEMENT_CATEGORY_COLOR, BLOCK_COLOR, CIVIDIS, sequentialColor,
} from '../palette.mjs';
import { electronConfig } from '../../calc/config.mjs';
import { propertiesOf } from '../../calc/element-properties.mjs';
import { fmt, fmtSci } from '../format.mjs';
import {
  COLOR_PROPERTIES, NUMERIC_KEYS, rangeOf, positionOf, valueOf, fitTicks,
} from '../heat.mjs';
import { useI18n } from '../LocaleContext.jsx';
import ElementCompare from '../components/ElementCompare.jsx';
import ElementDetail from '../components/ElementDetail.jsx';
import Molecule from '../components/Molecule.jsx';

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

/**
 * The colouring modes, in menu order: the two categorical ones first, then
 * every numeric property the data supports.
 *
 * Derived from COLOR_PROPERTIES rather than written out, so adding a property
 * to heat.mjs is the only edit needed to make it selectable.
 */
const COLOR_BY = ['category', 'block', ...NUMERIC_KEYS];

const BLOCKS = ['s', 'p', 'd', 'f'];

/** How many elements the radar comparison can hold before it stops reading. */
const MAX_COMPARE = 4;

/**
 * Cell background and border for a colour, at fill and border strength.
 *
 * Category and block colours are hex, so the alpha rides along as a suffix; the
 * heat ramp is an hsl() string, which needs the alpha inside the parentheses
 * instead. One helper for both so the legend and the cells cannot drift.
 */
/**
 * Cell fill and border for a palette colour.
 *
 * Every colour reaching here is a six-digit hex — the palette module normalises
 * to that — so the alpha rides along as an eight-digit hex suffix rather than
 * as rgba(). Eight-digit hex is a CSS colour in its own right, which keeps the
 * value a single string the browser parses without a conversion step.
 *
 * The fill is deliberately faint: the cell's own text has to stay readable on
 * top of it, and the legend is where the colour is meant to be read at full
 * strength.
 */
function tinted(color) {
  return { background: `${color}33`, borderColor: `${color}88` };
}

export default function ElementsTab({ theme = 'dark' }) {
  const { t } = useI18n();
  const [colorBy, setColorBy] = useState('category');
  const [selected, setSelected] = useState(() => elementBySymbol('Na'));
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState(null);
  const [compare, setCompare] = useState([]);
  // A SMILES string the user types to see the structure drawn. Kept separate
  // from the element selection: the two are different questions ("what is this
  // element" vs "what is this molecule") and sharing one input would make
  // selecting an element wipe a half-typed structure.
  const [smiles, setSmiles] = useState('');
  const [full, setFull] = useState(false);
  const gridRef = useRef(null);

  /**
   * Add or remove an element from the comparison.
   *
   * The cap is four because the radar's palette has eight hues and its axes
   * eight spokes — beyond four outlines the chart stops being readable long
   * before it runs out of colours. A refusal has to say so: silently dropping
   * the click would look like the button had stopped working.
   */
  const toggleCompare = useCallback((symbol) => {
    setCompare((prev) => {
      if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
      if (prev.length >= MAX_COMPARE) { setFull(true); return prev; }
      setFull(false);
      return [...prev, symbol];
    });
  }, []);

  // The table scrolls horizontally, so a tooltip positioned inside it would be
  // clipped at the edge. Fixed positioning escapes that, at the cost of going
  // stale when the page moves — hence hiding it on scroll rather than trying to
  // track the cell.
  useEffect(() => {
    if (!hover) return undefined;
    const hide = () => setHover(null);
    globalThis.addEventListener('scroll', hide, { passive: true, capture: true });
    return () => globalThis.removeEventListener('scroll', hide, { capture: true });
  }, [hover]);

  /*
   * Ranges are computed over the whole table, not the filtered view.
   *
   * A scale that re-fits itself to a search result makes two elements
   * incomparable with two others — the same shade would mean different numbers
   * depending on what happened to be typed in the search box.
   */
  const ranges = useMemo(() => {
    const out = {};
    // `propertiesOf` is keyed by atomic number, so it takes a number — passing
    // the element object yields null for every PubChem-backed property, which
    // silently collapses the range to the empty fallback and shades the table
    // on raw values instead of on the ramp.
    for (const key of NUMERIC_KEYS) out[key] = rangeOf(ELEMENTS, (e) => propertiesOf(e.number), key);
    return out;
  }, []);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return null;
    return new Set(
      ELEMENTS.filter((e) => {
        const cat = categoryOf(e);
        return e.symbol.toLowerCase().includes(q)
          || e.name.toLowerCase().includes(q)
          || e.zh.includes(query.trim())
          || String(e.number) === q
          // "卤素" or "halogen" lists the family, which is how the table is
          // usually queried — by group rather than by one element.
          || t(`elements.cat_${cat}`).toLowerCase().includes(q)
          || cat.toLowerCase().includes(q)
          || t(`elements.block_${blockOf(e)}`).toLowerCase().includes(q);
      }).map((e) => e.symbol),
    );
  }, [query, t]);

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
    const props = propertiesOf(el.number);
    if (colorBy === 'category') return tinted(ELEMENT_CATEGORY_COLOR[categoryOf(el)]);
    if (colorBy === 'block') return tinted(BLOCK_COLOR[blockOf(el)]);
    // Viridis, not a rainbow. A rainbow ramp is not monotonic in lightness, so
    // it draws boundaries where the data is smooth and is unreadable in
    // greyscale; see the note in palette.mjs. Same function the legend uses, so
    // the two cannot drift apart.
    const pos = positionOf(valueOf(el, props, colorBy), ranges[colorBy]);
    // No measurement for this element: render it as an explicit gap rather
    // than a shade at the bottom of the ramp, which would assert a value.
    if (pos === null) return { background: 'transparent', borderColor: 'var(--border)' };
    return tinted(sequentialColor(pos));
  }

  const dim = (el) => (matched && !matched.has(el.symbol) ? ' is-dim' : '');

  // Both live in the data module: the drawing row is not the chemical period,
  // and the f-block's group numbers are layout coordinates rather than chemistry.
  const chemPeriod = selected ? periodOf(selected) : null;
  const onDetachedRow = selected ? isFBlock(selected) : false;
  const cfg = selected ? electronConfig(selected.number) : null;
  const props = selected ? propertiesOf(selected.number) : null;

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
            <span className="legend-sw" style={{ background: ELEMENT_CATEGORY_COLOR[c] }} />
            {t(`elements.cat_${c}`)}
          </span>
        ))}
        {colorBy === 'block' && BLOCKS.map((b) => (
          <span className="legend-item" key={b}>
            <span className="legend-sw" style={{ background: BLOCK_COLOR[b] }} />
            {t(`elements.block_${b}`)}
          </span>
        ))}
        {NUMERIC_KEYS.includes(colorBy) && (() => {
          const r = ranges[colorBy];
          const fmtTick = (v) => (r.log ? fmtSci(v, 3) : fmt(v, 3));
          /*
           * Both ends of a six-decade ramp is not a scale. Density spans
           * 8.99e-5 to 22.57, and a reader who sees only those two numbers
           * cannot tell whether 1 g/cm³ sits a third of the way along or at
           * the far edge. The intermediates come from the same module that
           * chose the scale, so a log range is labelled with powers of ten and
           * a linear one with round numbers — and a tick that would land on
           * its neighbour is thinned rather than overprinted.
           */
          const ticks = fitTicks(r);
          return (
            <>
              {/* The ramp is drawn from the same palette the cells use, so the
                  legend cannot show a scale the table does not follow. It was a
                  hand-written rainbow gradient in CSS until the ramp changed to
                  cividis and the two silently disagreed. */}
              <span className="legend-track">
                <span
                  className="legend-ramp"
                  style={{ background: `linear-gradient(90deg, ${CIVIDIS.join(', ')})` }}
                />
                {ticks.map((tk, i) => (
                  <span
                    className="legend-tick"
                    key={tk.value}
                    style={{ left: `${tk.pos * 100}%` }}
                    data-first={i === 0 ? '' : undefined}
                    data-last={i === ticks.length - 1 ? '' : undefined}
                  >
                    {fmtTick(tk.value)}
                  </span>
                ))}
              </span>
              {/* Only properties that have a unit get one. A missing key
                  would render as the raw key name, which is worse than no
                  unit at all — it looks like a bug in the table. */}
              {COLOR_PROPERTIES[colorBy].unit !== '' && (
                <span className="legend-item legend-unit">
                  {t(`elements.unit_${colorBy}`)}
                </span>
              )}
              {/* A logarithmic scale has to say so. The same three colours
                  cover a factor of 6 or a factor of 250,000, and only the
                  label distinguishes them. */}
              {r.log && <span className="legend-item legend-unit">{t('elements.logScale')}</span>}
              {/* How much of the table the scale actually covers. Density is
                  measured for 96 of 118; an unlabelled ramp would read as if
                  it covered all of them. */}
              {r.count < ELEMENTS.length && (
                <span className="legend-item legend-unit">
                  {t('elements.coverage', { count: r.count, total: ELEMENTS.length })}
                </span>
              )}
            </>
          );
        })()}
      </div>

      {/* Structure drawing. Its own input rather than a detail of the selected
          element, because a molecule is not an element — the two are different
          questions and the panel answers both without conflating them. */}
      <div className="row">
        <div className="field">
          <label htmlFor="el-smiles">{t('molecule.input')}</label>
          <input
            id="el-smiles"
            type="text"
            value={smiles}
            placeholder={t('molecule.placeholder')}
            spellCheck="false"
            autoComplete="off"
            onChange={(e) => setSmiles(e.target.value)}
          />
        </div>
      </div>
      {smiles.trim() !== '' && (
        <Molecule smiles={smiles.trim()} theme={theme} size={320} />
      )}

      <div className="ptable-wrap">
        <div className="ptable" role="group" aria-label={t('elements.tableLabel')} ref={gridRef} onKeyDown={onKeyDown}>
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
              data-symbol={el.symbol}
              // One tab stop for the whole grid; arrows move within it.
              tabIndex={selected?.symbol === el.symbol ? 0 : -1}
              className={`pcell${dim(el)}${selected?.symbol === el.symbol ? ' is-on' : ''}${compare.includes(el.symbol) ? ' is-cmp' : ''}`}
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
              onClick={(e) => {
                // Ctrl/Cmd-click adds to the comparison. A plain click still
                // selects, because that is what the cell has always done and
                // turning every click into a comparison would break the detail
                // panel for the reader who only wants to look one element up.
                if (e.ctrlKey || e.metaKey) { e.preventDefault(); toggleCompare(el.symbol); return; }
                setSelected(el);
              }}
              onMouseEnter={(e) => setHover({ el, rect: e.currentTarget.getBoundingClientRect() })}
              onMouseLeave={() => setHover(null)}
              onFocus={(e) => setHover({ el, rect: e.currentTarget.getBoundingClientRect() })}
              onBlur={() => setHover(null)}
            >
              {/* The number and the Chinese name are already in the button's
                  accessible name, so the visible copies are hidden from
                  assistive tech — otherwise the cell announces its contents
                  twice, and the visible text stops matching the label. */}
              <span className="pcell-z" aria-hidden="true">{el.number}</span>
              <span className="pcell-sym">{el.symbol}</span>
              <span className="pcell-name" aria-hidden="true">{el.zh}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Hover/focus readout. Placed above the cell when there is room, below
          when there is not, so it never runs off the top of the viewport. */}
      {hover && (() => {
        const { el, rect } = hover;
        const above = rect.top > 120;
        return (
          <div
            className="eltip"
            style={{
              left: Math.min(Math.max(rect.left + rect.width / 2, 90), globalThis.innerWidth - 90),
              top: above ? rect.top - 8 : rect.bottom + 8,
              transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            }}
          >
            <strong>{el.symbol}</strong> {el.zh} · {el.name}
            <span className="eltip-row">
              {t('elements.mass')} {fmt(el.mass, 4)} g/mol
            </span>
            <span className="eltip-row">{t(`elements.cat_${categoryOf(el)}`)}</span>
          </div>
        );
      })()}

      {/* The comparison is opt-in and stays out of the way until it is asked
          for: two elements is the minimum that compares to anything, so a
          single Ctrl-click changes nothing visible except the cell's marker.
          The refusal notice is here rather than inside the panel because the
          panel does not render at all in that state. */}
      {full && <div className="msg warn">{t('elements.compareFull')}</div>}
      {compare.length >= 2 && (
        <ElementCompare
          symbols={compare}
          theme={theme}
          onRemove={(s) => { setFull(false); toggleCompare(s); }}
        />
      )}
      {compare.length === 1 && <div className="hint">{t('elements.compareNeed')}</div>}

      {matched && matched.size === 0 && (
        <div className="hint">{t('elements.noMatch', { query })}</div>
      )}
      {matched && matched.size > 0 && (
        <div className="hint">{t('elements.matchCount', { count: matched.size })}</div>
      )}

      <ElementDetail
        element={selected}
        chemPeriod={chemPeriod}
        onDetachedRow={onDetachedRow}
        config={cfg}
        properties={props}
      />
    </div>
  );
}