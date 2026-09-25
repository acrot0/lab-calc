import React, { useState, useMemo } from 'react';
import { unitConvert, MASS_UNITS, VOLUME_UNITS, CONC_UNITS } from '../../calc/buffer.mjs';
import { NumField, Result, Err, Warn } from '../components/Fields.jsx';
import { fmt, fmtSci, n } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';

/**
 * Unit conversion.
 *
 * The three dimensions are kept apart in the pickers. A single merged list of
 * every unit lets a user pick grams on one side and millilitres on the other,
 * which is not a conversion — it needs a density this screen never asks for.
 * The calculator layer rejects it too; separating the lists here means the
 * invalid choice is never offered in the first place.
 */
const DIMENSIONS = [
  { id: 'mass', units: MASS_UNITS },
  { id: 'volume', units: VOLUME_UNITS },
  { id: 'concentration', units: CONC_UNITS },
];

export default function ConvertTab() {
  const { t } = useI18n();
  const [value, setValue] = useState('1');
  const [dim, setDim] = useState('mass');
  const [from, setFrom] = useState('g');
  const [to, setTo] = useState('mg');

  const active = DIMENSIONS.find((d) => d.id === dim) ?? DIMENSIONS[0];
  const units = Object.keys(active.units);

  /** Switching dimension resets both sides: the old units no longer exist. */
  function changeDim(next) {
    const first = Object.keys(DIMENSIONS.find((d) => d.id === next).units);
    setDim(next);
    setFrom(first[0]);
    setTo(first[1] ?? first[0]);
  }

  const result = useMemo(() => {
    try {
      return { value: unitConvert(n(value), from, to), error: null };
    } catch (e) {
      return { value: null, error: errorMessage(e, t) };
    }
  }, [value, from, to, t]);

  const sameUnit = from === to;

  /*
   * The conversion factor, made explicit.
   *
   * Every unit here is defined by its factor to the dimension's base unit, so
   * the whole conversion is one division of two of those factors. Showing it
   * turns an opaque answer into something a student can reproduce on paper.
   */
  const worked = useMemo(() => {
    if (result.value === null || sameUnit) return null;
    const factorFrom = active.units[from];
    const factorTo = active.units[to];
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
  }, [result.value, sameUnit, active, from, to, value, t]);

  return (
    <div className="card">
      <NumField label={t('convert.value')} value={value} onChange={setValue} />

      <div className="field">
        <label htmlFor="dim">{t('convert.title')}</label>
        <div className="seg" role="group">
          {DIMENSIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`seg-btn${d.id === dim ? ' is-on' : ''}`}
              aria-pressed={d.id === dim}
              onClick={() => changeDim(d.id)}
            >
              {t(`convert.dim_${d.id}`)}
            </button>
          ))}
        </div>
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

      {result.error && <Err>{result.error}</Err>}
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
    </div>
  );
}
