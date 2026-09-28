import React, { useCallback, useState } from 'react';
import { useI18n } from '../LocaleContext.jsx';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { DIGIT_KEYS, FN_PAGES, MEMORY_KEYS } from './calculator-keys.mjs';

/**
 * The calculator's keypad.
 *
 * ## Why this is a component rather than markup inside the drawer
 *
 * Two surfaces need it: the floating drawer, which is the desktop shape, and
 * the calculator panel on the convert tab, which is where a phone user lands
 * when they pick 计算. Before this, only the drawer had a keypad — the tab's
 * panel was a bare text field, so on a phone tapping it raised the system
 * keyboard over half the screen and buried the result. The fix is not a second
 * keypad written for the tab; it is this one, shared, so the two cannot give
 * different answers or drift apart in styling.
 *
 * ## Why the rows are declared here and the keys are not
 *
 * The key tables live in `calculator-keys.mjs` — pure data, tested without a
 * render. What is here is the arrangement: which rows swap with the page and
 * which stay put.
 *
 * The memory row and the digits do not swap. A user on either function page has
 * to be able to type a number, recall the last answer and clear the entry; if
 * those lived on one page, switching to the other would take away the ability
 * to enter anything.
 *
 * ## Why `=` sits outside the scrolling rows
 *
 * Upright everything fits and the split is invisible. Landscape there is 150px
 * for 220px of keys, so the rows scroll — and `=` stays put below them, because
 * it is the key a thumb finds by position at the bottom of the pad. The
 * alternative was putting it behind the scroll, or shrinking the keys below the
 * 44px touch floor.
 *
 * ## Why the function rows can be collapsed
 *
 * The drawer has a window of its own and room for all nine rows. The panel on
 * the convert tab does not: at 390×844 the full pad is 574px, and with the
 * entry and the result above it the field the user is typing into ends up
 * scrolled off the top — a keypad that hides its own display.
 *
 * Collapsed, the digits, the operators, the memory row and `=` remain, which is
 * 264px and fits with the entry and the result on screen together. That is also
 * the right default on its own terms: the digits are what a thumb reaches for
 * without looking, and the scientific functions are the deliberate, occasional
 * presses. `test/keypad.test.mjs` guards that no collapse can strand a user
 * without a digit or a way to clear.
 *
 * @param onKey       called with a key object: either `{ action }` or `{ insert }`
 * @param onFocus     asked to return focus to the entry after a press, so a
 *                    hardware keyboard can carry on typing on a hybrid device
 * @param collapsible when true, the function rows start hidden behind a toggle
 */
export default function CalculatorKeypad({
  onKey, onFocus, idPrefix = 'calc', collapsible = false,
}) {
  const { t } = useI18n();
  const [fnPage, setFnPage] = useState(0);
  const [fnOpen, setFnOpen] = useState(!collapsible);

  const press = useCallback((k) => {
    onKey(k);
    onFocus?.();
  }, [onKey, onFocus]);

  /*
   * One key, drawn the same way on every row.
   *
   * The zones differ only in which class they carry — the keys mean the same
   * things — so they share this rather than each carrying its own copy that
   * could drift in styling or in how a key with no `insert` is handled.
   */
  const renderKey = useCallback((k) => (
    <button
      key={k.label}
      type="button"
      className={`calc-key is-${k.zone}${k.span ? ' is-wide' : ''}`}
      // A spanning key is a single property rather than a rule per width, so it
      // is inline. `gridColumn` is the one place the layout is data.
      style={k.span ? { gridColumn: `span ${k.span}` } : undefined}
      title={k.title ? t(`convert.calcKey_${k.title}`) : undefined}
      aria-label={k.title ? t(`convert.calcKey_${k.title}`) : k.label}
      onClick={() => press(k)}
    >
      {k.label}
    </button>
  ), [t, press]);

  return (
    <>
      {/*
        The page switch, and — where the pad is collapsible — the toggle that
        shows and hides the function rows.

        A two-segment control rather than a toggle, because there are two pages
        and a toggle can only say "the other one" — with the page count written
        on each segment, the user can see where they are without pressing
        anything. It sits above the keypad rather than among the keys so it is
        never mistaken for a key that inserts something; every other button here
        types a character.
      */}
      {fnOpen && (
        <div className="calc-pages" role="group" aria-label={t('convert.calcMore')}>
          {FN_PAGES.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`calc-page${fnPage === i ? ' is-on' : ''}`}
              aria-pressed={fnPage === i}
              onClick={() => setFnPage(i)}
            >
              <Icons.calc size={ICON_SIZE.inline} aria-hidden="true" />
              {t(`convert.calcPage${i + 1}`)}
            </button>
          ))}
          {collapsible && (
            <button
              type="button"
              className="calc-page is-toggle"
              aria-expanded={fnOpen}
              onClick={() => setFnOpen(false)}
            >
              {t('convert.calcFnHide')}
            </button>
          )}
        </div>
      )}

      <div className="calc-keypad" role="group" aria-label={t('convert.calcKeypad')} id={`${idPrefix}-keypad`}>
        <div className="calc-rows">
          {/* Only the function rows swap. The memory row and the digits stay
              put, so a user on either page can still type a number, recall the
              answer and clear the entry — and so collapsing the function rows
              cannot take away the ability to enter anything. */}
          {fnOpen && FN_PAGES[fnPage].map((row, ri) => (
            <div className="calc-row" key={`fn-${ri}`}>
              {row.map(renderKey)}
            </div>
          ))}
          {MEMORY_KEYS.map((row, ri) => (
            <div className="calc-row is-memory" key={`mem-${ri}`}>
              {row.map(renderKey)}
            </div>
          ))}
          {DIGIT_KEYS.slice(0, -1).map((row, ri) => (
            <div className="calc-row" key={`dig-${ri}`}>
              {row.map(renderKey)}
            </div>
          ))}
        </div>
        {/* The last row of `DIGIT_KEYS` is the `=` row and only that key — see
            the table. Taken by slice rather than written here so the key stays
            in `calculator-keys.mjs` with the rest. */}
        <div className="calc-row is-equals">
          {DIGIT_KEYS[DIGIT_KEYS.length - 1].map(renderKey)}
        </div>
      </div>

      {/*
        The way back to the function rows.

        Below the pad rather than above it, so the control is where the keys it
        reveals will appear — and so the digits keep the position a thumb
        learned. A collapse with no visible way to expand would be a one-way
        door.
      */}
      {collapsible && !fnOpen && (
        <button
          type="button"
          className="calc-fn-show"
          aria-expanded={false}
          aria-controls={`${idPrefix}-keypad`}
          onClick={() => setFnOpen(true)}
        >
          {t('convert.calcFnShow')}
        </button>
      )}
    </>
  );
}
