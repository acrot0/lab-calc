import React, { useState, useMemo } from 'react';
import { DIMENSIONS, convert, sharedDimension } from '../../calc/units.mjs';
import { evaluate } from '../../calc/expression.mjs';
import { Result, Err } from '../components/Fields.jsx';
import { ArtBalance } from '../components/Illustrations.jsx';
import { fmt } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import Card from '../components/Card.jsx';
import UnitConverter, { DIMENSIONS_SHOWN } from '../components/UnitConverter.jsx';

/**
 * Unit conversion, and a calculator.
 *
 * Two modes in one tab because they answer the same question at different
 * levels: "what is 25 °C in K" and "what is 5 g divided by 250 mL". Splitting
 * them across two tabs would put two halves of one thought in two places.
 *
 * The converter itself is a shared component — the calculator drawer shows the
 * same one in its second tab, and a converter that gave a different answer in
 * the drawer than here would be worse than not having it in the drawer. What
 * this tab adds is the illustration and the wide layout.
 */
export default function ConvertTab() {
  const { t } = useI18n();
  const [mode, setMode] = useState('convert');

  return (
    <Card>
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

      {mode === 'convert' ? <UnitConverter /> : <Calculator />}
    </Card>
  );
}

/**
 * The expression calculator, on the tab.
 *
 * A field and an example row rather than a keypad: this screen has a hardware
 * keyboard in front of it, and a keypad on a desktop is a slower way to type.
 * The keypad is in the drawer, which is the surface a phone uses — see
 * `CalculatorDrawer.jsx`.
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
        // No picker to consult here, so the dimension is the one both symbols
        // share. `180 deg -> rad` is obviously an angle; the bare lookup would
        // read `rad` as the absorbed dose and refuse. `g -> mL` shares no
        // dimension and still fails, so this cannot hide a real mismatch.
        const v = convert(
          Number.parseFloat(numText), fromUnit, toUnit, sharedDimension(fromUnit, toUnit),
        );
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
    ? (DIMENSIONS_SHOWN.includes(result.dimension)
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
/** Re-exported so a test can assert the list covers the units module. */
export { DIMENSIONS };
