import React, { useState, useMemo } from 'react';
import {
  DIMENSIONS, DIMENSION_KEYS, UNITS, convert, unitsOf,
} from '../../calc/units.mjs';
import { evaluate } from '../../calc/expression.mjs';
import { NumField, Result, Err, Warn } from '../components/Fields.jsx';
import { ArtBalance, ArtCylinder, ArtConvert } from '../components/Illustrations.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';

/**
 * The dimensions this screen offers, in the order they are shown.
 *
 * Written out rather than derived from `DIMENSION_KEYS` so the order is a
 * decision — mass and volume first, because that is what a bench converts most,
 * and current last, because it is here to complete the electrical set rather
 * than because anyone converts amperes on this screen.
 *
 * The unit lists come from the units module, so a unit added there appears here
 * without an edit. That is the point: the table is the single source.
 */
const ORDER = [
  'mass', 'volume', 'amount', 'molarity', 'massConcentration',
  'length', 'area', 'time', 'temperature',
  'pressure', 'energy', 'voltage', 'resistance', 'current',
];

/** Every dimension the module defines must be offered, and none invented. */
const DIMENSIONS_SHOWN = ORDER.filter((d) => DIMENSIONS[d]);

/**
 * Unit conversion, and a calculator.
 *
 * Two modes in one tab because they answer the same question at different
 * levels: "what is 25 °C in K" and "what is 5 g divided by 250 mL". Splitting
 * them across two tabs would put two halves of one thought in two places.
 *
 * The converter keeps the dimensions apart in the pickers. A single merged list
 * of every unit lets a user pick grams on one side and millilitres on the other,
 * which is not a conversion — it needs a density this screen never asks for.
 */
export default function ConvertTab() {
  const { t } = useI18n();
  const [mode, setMode] = useState('convert');

  return (
    <div className="card">
      <div className="seg" role="group" aria-label={t('convert.title')}>
        <button
          type="button"
          className={`seg-btn${mode === 'convert' ? ' is-on' : ''}`}
          aria-pressed={mode === 'convert'}
          onClick={() => setMode('convert')}
        >
          {t('convert.mode_convert')}
        </button>
        <button
          type="button"
          className={`seg-btn${mode === 'calc' ? ' is-on' : ''}`}
          aria-pressed={mode === 'calc'}
          onClick={() => setMode('calc')}
        >
          {t('convert.mode_calc')}
        </button>
      </div>

      {mode === 'convert' ? <Converter /> : <Calculator />}
    </div>
  );
}

/** Convert one value between two units of the same dimension. */
function Converter() {
  const { t } = useI18n();
  const [value, setValue] = useState('1');
  const [dim, setDim] = useState('mass');
  const [from, setFrom] = useState('g');
  const [to, setTo] = useState('mg');

  const units = unitsOf(dim);
  const active = DIMENSIONS[dim];

  /** Switching dimension resets both sides: the old units no longer exist. */
  function changeDim(next) {
    const list = unitsOf(next);
    setDim(next);
    setFrom(list[0]);
    setTo(list[1] ?? list[0]);
  }

  const result = useMemo(() => {
    try {
      return { value: convert(n(value), from, to), error: null };
    } catch (e) {
      return { value: null, error: errorMessage(e, t) };
    }
  }, [value, from, to, t]);

  const sameUnit = from === to;

  /*
   * The conversion factor, made explicit.
   *
   * Every unit is defined by its factor to its dimension's SI base, so the
   * whole conversion is one division of two of those factors. Showing it turns
   * an opaque answer into something a student can reproduce on paper. Skipped
   * for temperature, where the conversion is not a factor at all — printing a
   * "factor" for an offset conversion would be printing a number that does not
   * describe the operation.
   */
  const worked = useMemo(() => {
    if (result.value === null || sameUnit) return null;
    if (dim === 'temperature') {
      return [
        { term: t('common.worked_UnitFactor'), value: '' },
        {
          term: `${from} → ${to}`,
          value: `${fmt(n(value), 6)} ${from} = ${fmt(result.value, 6)} ${to}`,
        },
      ];
    }
    const factorFrom = UNITS[from]?.factor;
    const factorTo = UNITS[to]?.factor;
    if (factorFrom == null || factorTo == null) return null;
    return [
      { term: t('common.worked_UnitFactor'), value: '' },
      {
        term: `${from} → ${to}`,
        value: t('common.worked_UnitStep', {
          value: fmt(n(value), 6),
          from,
          factorFrom: fmtSci(factorFrom, 4),
          factorTo: fmtSci(factorTo, 4),
          result: fmt(result.value, 6),
          to,
        }),
      },
    ];
  }, [result.value, sameUnit, dim, from, to, value, t]);

  return (
    <>
      <NumField label={t('convert.value')} value={value} onChange={setValue} />

      <div className="field">
        <label htmlFor="dim">{t('convert.title')}</label>
        <select id="dim" value={dim} onChange={(e) => changeDim(e.target.value)}>
          {DIMENSIONS_SHOWN.map((d) => (
            <option key={d} value={d}>{t(`convert.dim_${d}`)}</option>
          ))}
        </select>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="from">{t('convert.from')}</label>
          <select id="from" value={from} onChange={(e) => setFrom(e.target.value)}>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="to">{t('convert.to')}</label>
          <select id="to" value={to} onChange={(e) => setTo(e.target.value)}>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {/* One tap to flip a conversion rather than re-picking both sides. */}
      <button
        type="button"
        className="ghost"
        onClick={() => { const f = from; setFrom(to); setTo(f); }}
        disabled={sameUnit}
      >
        ⇄ {t('convert.swap')}
      </button>

      {result.error && (
        <>
          <Err>{result.error}</Err>
          {/* The one state where the converter has nothing to show. A graduated
              cylinder rather than the balance: two empty states that look alike
              make the user check which one they are on. */}
          <div className="empty">
            <ArtCylinder />
            {t('convert.convertEmpty')}
          </div>
        </>
      )}
      {sameUnit && !result.error && <Warn>{t('convert.sameUnit')}</Warn>}

      <Result
        value={result.value !== null ? fmt(result.value, 6) : null}
        unit={to}
        worked={worked} workedLabel={t('common.worked')}
        rows={result.value !== null ? [
          [t('convert.from'), `${value} ${from}`],
          [t(`convert.dim_${dim}`), `${fmt(result.value, 6)} ${to}`],
        ] : null}
      />

      {/* The dimension's base unit, and the factor from it to the unit being
          converted from. Named "base unit", not "unnamed dimension" — the
          latter was wrong on every row, since mass and volume are named. */}
      <p className="hint">
        {t('convert.baseUnit')}: {active.base}
        {' · '}
        {t('convert.conversionFactor')}: {dim === 'temperature' ? '—' : fmtSci(UNITS[active.base]?.factor ?? 1, 4)}
      </p>

      {/* A figure, not an empty state: the converter always has a value, so
          this is here to show what a conversion *is* — the same amount under
          two sets of markings. */}
      <figure className="figure">
        <ArtConvert />
        <figcaption>{t('convert.figureCaption')}</figcaption>
      </figure>
    </>
  );
}

/**
 * The expression calculator.
 *
 * The expression is evaluated on every keystroke and the result shown live,
 * rather than behind a button. A calculator with a `=` key makes you ask twice
 * for every answer, and the cost of live evaluation here is nothing — the
 * parser is a few hundred microseconds on input this short.
 *
 * `25 C -> K` is accepted as a special form because it is the one conversion
 * the expression syntax cannot express: temperature does not compose, so it is
 * written as an arrow rather than as arithmetic.
 */
function Calculator() {
  const { t } = useI18n();
  const [src, setSrc] = useState('');

  const result = useMemo(() => {
    if (src.trim() === '') return null;

    // The arrow form, handled before the evaluator sees it. Only a plain
    // temperature conversion is accepted here; `25 C -> K + 5` is not a thing.
    const arrow = /^([\d.eE+-]+)\s*([A-Za-z]+)\s*->\s*([A-Za-z]+)$/.exec(src.trim());
    if (arrow) {
      const [, numText, fromUnit, toUnit] = arrow;
      try {
        const v = convert(Number.parseFloat(numText), fromUnit, toUnit);
        return { value: v, unit: toUnit, dimension: null, error: null };
      } catch (e) {
        return { value: null, error: errorMessage(e, t) };
      }
    }

    try {
      const r = evaluate(src);
      return {
        value: r.value,
        unit: r.unit,
        dimension: r.dimension,
        error: null,
      };
    } catch (e) {
      return { value: null, error: errorMessage(e, t) };
    }
  }, [src, t]);

  /*
   * A dimension with no familiar name is reported as its composed exponents
   * rather than translated: `M2` is not a word in either locale, and inventing
   * a translation for it would be inventing a quantity.
   */
  const dimLabel = result?.dimension
    ? (DIMENSION_KEYS.includes(result.dimension)
      ? t(`convert.dim_${result.dimension}`)
      : result.dimension)
    : null;

  return (
    <>
      <div className="field">
        <label htmlFor="calc-src">{t('convert.calcLabel')}</label>
        <input
          id="calc-src"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck="false"
          value={src}
          placeholder={t('convert.calcPlaceholder')}
          onChange={(e) => setSrc(e.target.value)}
        />
        <div className="hint">{t('convert.calcHint')}</div>
      </div>

      <div className="field">
        <span className="field-label">{t('convert.calcExamples')}</span>
        <div className="chip-row">
          {['calcEx1', 'calcEx2', 'calcEx3', 'calcEx4', 'calcEx5', 'calcEx6'].map((k) => (
            <button
              key={k}
              type="button"
              className="chip"
              onClick={() => setSrc(t(`convert.${k}`))}
            >
              {t(`convert.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {result?.error && <Err>{result.error}</Err>}

      {result === null ? (
        <div className="empty">
          <ArtBalance />
          {t('convert.calcEmpty')}
        </div>
      ) : (
        <Result
          value={result.value !== null ? fmt(result.value, 8) : null}
          unit={result.unit ?? ''}
          rows={result.value !== null && dimLabel
            ? [[t('convert.calcResult'), dimLabel]]
            : null}
        />
      )}
    </>
  );
}

/** Re-exported for the tests, which check every dimension has a label. */
export const SHOWN_DIMENSIONS = DIMENSIONS_SHOWN;
