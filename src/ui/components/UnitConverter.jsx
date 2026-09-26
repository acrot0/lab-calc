import React, { useState, useMemo } from 'react';
import {
  DIMENSIONS, UNITS, convert, unitsOf,
} from '../../calc/units.mjs';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { NumField, Result, Err, Warn } from './Fields.jsx';
import { ArtConvert, ArtCylinder } from './Illustrations.jsx';

/**
 * The dimensions this converter offers, in the order they are shown.
 *
 * Written out rather than derived from the units module's key order so the
 * order is a decision — mass and volume first, because that is what a bench
 * converts most, and current near the end, because it is here to complete the
 * electrical set rather than because anyone converts amperes.
 *
 * The unit lists themselves come from the units module, so a unit added there
 * appears here without an edit. That is the point: the table is the single
 * source.
 */
export const DIMENSIONS_SHOWN = [
  // Concentration first, then the bench quantities, then the instrument
  // readouts — the order a working session moves through, not alphabetical.
  'mass', 'volume', 'amount',
  'molarity', 'massConcentration', 'molality',
  'molarMass', 'molarVolume', 'molarEnergy', 'molarEntropy',
  'length', 'area', 'time', 'temperature', 'pressure', 'energy',
  'voltage', 'resistance', 'current', 'charge', 'conductance', 'power',
  'force', 'frequency', 'wavenumber', 'velocity',
  'viscosity', 'kinematicViscosity', 'surfaceTension',
  'heatCapacity', 'specificHeat', 'dose', 'catalyticActivity',
  // Dimensionless ratios and angle last: they are the two that are not
  // quantities of matter, and they read as a footnote to the list above.
  'ratio', 'angle',
].filter((d) => DIMENSIONS[d]);

/**
 * Unit conversion, as one component used in two places.
 *
 * ## Why it is shared rather than written twice
 *
 * The converter appears as its own tab and inside the calculator drawer, and
 * the two must agree about what a unit means — a converter that gave a
 * different answer in the drawer than on its own page would be worse than not
 * having it in the drawer at all. The dimension list, the conversion, the
 * worked steps and the error messages are all one implementation; only the
 * decoration differs, which is what `compact` selects.
 *
 * ## Why the dimensions stay separated in the pickers
 *
 * A single merged list of every unit lets a user pick grams on one side and
 * millilitres on the other, which is not a conversion — it needs a density this
 * screen never asks for. Keeping the dimension as a picker of its own is what
 * makes the impossible pair unreachable rather than merely rejected.
 */
export default function UnitConverter({ compact = false, onFill = null }) {
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
      // `dim` is passed as the hint, not left to the bare lookup. Ten symbols
      // mean two things — `rad` is the radian and the rad (absorbed dose), `A`
      // is the ampere and the ångström — and a user who has picked "angle"
      // means the radian. Without the hint this refused to convert a unit it
      // had just offered in its own list.
      return { value: convert(n(value), from, to, dim), error: null };
    } catch (e) {
      return { value: null, error: errorMessage(e, t) };
    }
  }, [value, from, to, dim, t]);

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
        <label htmlFor={compact ? 'drawer-dim' : 'dim'}>{t('convert.title')}</label>
        <select
          id={compact ? 'drawer-dim' : 'dim'}
          value={dim}
          onChange={(e) => changeDim(e.target.value)}
        >
          {DIMENSIONS_SHOWN.map((d) => (
            <option key={d} value={d}>{t(`convert.dim_${d}`)}</option>
          ))}
        </select>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor={compact ? 'drawer-from' : 'from'}>{t('convert.from')}</label>
          <select
            id={compact ? 'drawer-from' : 'from'}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          >
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={compact ? 'drawer-to' : 'to'}>{t('convert.to')}</label>
          <select
            id={compact ? 'drawer-to' : 'to'}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          >
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

      {/* Filling the field behind the window is the reason the window can stay
          open at all — and it is as useful for a conversion as for a sum: "25 °C
          is 298.15 K, put that in the temperature box". */}
      {onFill && result.value !== null && !sameUnit && (
        <button type="button" className="calc-fill" onClick={() => onFill(result.value)}>
          {t('convert.calcFill')}
        </button>
      )}

      {result.error && (
        <>
          <Err>{result.error}</Err>
          {/* The one state where the converter has nothing to show. A graduated
              cylinder rather than the balance: two empty states that look alike
              make the user check which one they are on. */}
          {!compact && (
            <div className="empty">
              <ArtCylinder />
              {t('convert.convertEmpty')}
            </div>
          )}
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
          two sets of markings. Dropped in the drawer, where the room is better
          spent on the controls. */}
      {!compact && (
        <figure className="figure">
          <ArtConvert />
          <figcaption>{t('convert.figureCaption')}</figcaption>
        </figure>
      )}
    </>
  );
}
