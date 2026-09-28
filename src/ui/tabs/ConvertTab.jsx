import React, { useState, useMemo, useCallback, useRef } from 'react';
import { DIMENSIONS, convert, sharedDimension } from '../../calc/units.mjs';
import { evaluate } from '../../calc/expression.mjs';
import { Result, Err } from '../components/Fields.jsx';
import { ArtBalance } from '../components/Illustrations.jsx';
import { fmt } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { ACTIONS } from '../components/calculator-actions.mjs';
import CalculatorKeypad from '../components/CalculatorKeypad.jsx';
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
 * ## Two input surfaces, chosen by pointer type
 *
 * On a fine pointer this is a field and an example row. A desktop has a
 * hardware keyboard in front of it, and an on-screen keypad is a slower way to
 * type on one.
 *
 * On a coarse pointer it is the field *plus* a keypad. The field goes read-only
 * and the keypad becomes the way in — the previous behaviour was a bare text
 * field, so tapping it raised the system keyboard over the bottom half of the
 * screen, covering the result the user tapped it to see. The keypad is the same
 * component the drawer renders; see `CalculatorKeypad.jsx`.
 *
 * `(pointer: coarse)` rather than a width breakpoint, because the question is
 * not how wide the screen is: a tablet has a coarse pointer at 1024px and a
 * narrow desktop window has a fine one at 500px.
 *
 * ## The arrow form
 *
 * `25 C -> K` is accepted as a special form because it is the one conversion
 * the expression syntax cannot express: temperature does not compose, so it is
 * written as an arrow rather than as arithmetic.
 */
function Calculator() {
  const { t } = useI18n();
  const [src, setSrc] = useState('');
  const inputRef = useRef(null);

  /*
   * Whether this is a device whose only keyboard is on its screen.
   *
   * Read once, at mount, rather than on every render: the pointer type does not
   * change while the page is open, and a `matchMedia` call in render would run
   * on every keystroke.
   *
   * `(pointer: coarse)` rather than a width breakpoint, because the question is
   * not how wide the screen is — a 1024px tablet has a coarse pointer and a
   * 500px desktop window has a fine one. The drawer uses the same query for the
   * same reason.
   */
  const [touch] = useState(
    () => globalThis.matchMedia?.('(pointer: coarse)')?.matches === true,
  );

  /*
   * On a touch device the entry is read-only and the keypad below is the way in.
   *
   * This is the whole fix for the reported problem: tapping the field raised the
   * system keyboard over the bottom half of the screen — including the result,
   * which is the thing the user tapped it to see. A `readOnly` field is not
   * focusable-by-tap for text entry, so no keyboard appears, and the custom
   * keypad is the only input. It is not `disabled`: the value stays selectable
   * and copyable, and the examples below still fill it.
   *
   * Left writable on a fine pointer, where the hardware keyboard is faster than
   * any on-screen one and the field is the right control.
   */
  const useKeypad = touch;

  /*
   * Session state for the keypad's actions.
   *
   * `ans` and the memory live on this panel rather than in the drawer: they are
   * state for the surface the user is on, and a memory that survived switching
   * tabs would recall a number the user cannot see anywhere.
   */
  const [memory, setMemory] = useState(null);
  const [last, setLast] = useState(null);

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

  /*
   * The keypad's action context.
   *
   * The same shape the drawer builds, because the actions are the same ones —
   * `ACTIONS` is a shared registry, and a second implementation of `clear` here
   * would be a second place for it to be wrong.
   *
   * Declared after `result` because `equals` reads it: `=` is what moves the
   * result into `ans`, which is what makes a chained calculation work without
   * retyping — `5 g / 250 mL`, `=`, then `ans * 2`.
   */
  const actionCtx = useMemo(() => ({
    setSrc,
    setMemory,
    result,
    last,
    memory,
    formatNumber: (n) => fmt(n, 10),
    commit: () => {
      if (result && !result.error && result.value !== null) setLast(result.value);
    },
  }), [result, last, memory]);

  const pressKey = useCallback((k) => {
    if (k.action) {
      ACTIONS[k.action]?.(actionCtx);
      return;
    }
    setSrc((s) => s + k.insert);
  }, [actionCtx]);

  // Focus returns to the entry after a key press so a hybrid device — a tablet
  // with a keyboard case — can carry on typing on the hardware one.
  const focusEntry = useCallback(() => inputRef.current?.focus(), []);

  return (
    <>
      <div className="field is-wide">
        <label htmlFor="calc-src">{t('convert.calcLabel')}</label>
        <input
          id="calc-src"
          ref={inputRef}
          type="text"
          // `none` rather than `text` on a touch device: it is the hint that
          // suppresses the software keyboard on most browsers. `readOnly` below
          // is the guarantee — a read-only field cannot raise one at all — and
          // this is the belt to that pair of braces, covering the browsers that
          // ignore readOnly for focus.
          inputMode={useKeypad ? 'none' : 'text'}
          readOnly={useKeypad}
          autoComplete="off"
          spellCheck="false"
          value={src}
          placeholder={t('convert.calcPlaceholder')}
          onChange={(e) => setSrc(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') pressKey({ action: 'equals' }); }}
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

      {/*
        The keypad, on the surfaces that have no other keyboard.

        Above the result rather than below it, and that ordering is the fix for
        the second half of the complaint — the panel being "very large". With
        the entry no longer raising a system keyboard, the result stays on
        screen while the user types; putting the keypad under the result would
        push the number the user is watching off the bottom as the expression
        grows.
      */}
      {useKeypad && (
        <div className="calc-panel-keypad">
          <CalculatorKeypad onKey={pressKey} onFocus={focusEntry} idPrefix="panel" collapsible />
        </div>
      )}

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
