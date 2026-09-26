import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { evaluate } from '../../calc/expression.mjs';
import { DIMENSION_KEYS } from '../../calc/units.mjs';
import { fmt } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { canFill, fillField, onFieldChange } from '../field-bridge.mjs';
import {
  clampPosition, defaultPosition, dragTo, isDragHandle,
} from '../float-window.mjs';

/** Where the window was last left, so it reopens where the user put it. */
const POSITION_KEY = 'lab-calc.calcPos.v1';

function loadPosition(store) {
  try {
    const raw = store?.getItem(POSITION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? p : null;
  } catch {
    return null;
  }
}

function savePosition(store, pos) {
  try {
    store?.setItem(POSITION_KEY, JSON.stringify(pos));
    return true;
  } catch {
    return false;
  }
}

/**
 * The keypad, as rows of [label, insertion].
 *
 * The insertion is separate from the label because several keys type more than
 * they show: `x²` inserts `^2`, `√` inserts `sqrt(`, and `π` inserts `pi`. A
 * keypad that inserted its own glyph would produce an expression the parser
 * cannot read.
 *
 * The layout is the standard four-function arrangement with the scientific
 * functions in a strip above it. Someone who has used any calculator app
 * already knows where the digits and the operators are; a novel layout would
 * be a thing to learn for no gain.
 */
/** The four function rows shown on the first page. */
export const COMMON_KEYS = [
  [
    { label: 'sin', insert: 'sin(', fn: true },
    { label: 'cos', insert: 'cos(', fn: true },
    { label: 'tan', insert: 'tan(', fn: true },
    { label: 'π', insert: 'pi' },
    { label: 'e', insert: 'e' },
  ],
  [
    { label: 'ln', insert: 'ln(', fn: true, title: 'ln' },
    { label: 'log', insert: 'log(', fn: true, title: 'log' },
    { label: 'sin⁻¹', insert: 'asin(', fn: true, title: 'asin' },
    { label: 'cos⁻¹', insert: 'acos(', fn: true, title: 'acos' },
    { label: 'tan⁻¹', insert: 'atan(', fn: true, title: 'atan' },
  ],
  [
    { label: 'n!', insert: '!' },
    { label: '%', insert: '%', title: 'percent' },
    { label: 'mod', insert: ' mod ', fn: true, title: 'modulo' },
    { label: '(', insert: '(' },
    { label: ')', insert: ')' },
  ],
  [
    { label: 'x^y', insert: '^', fn: true, title: 'power' },
    { label: 'x²', insert: '^2', fn: true, title: 'square' },
    { label: '√', insert: 'sqrt(', fn: true, title: 'sqrt' },
    { label: '∛', insert: 'cbrt(', fn: true, title: 'cbrt' },
    { label: '|x|', insert: 'abs(', fn: true, title: 'abs' },
  ],
];

/**
 * The digit and operator block, below both function pages.
 *
 * It is shared rather than duplicated onto each page because swapping it out
 * would take the digits away: a user on the function page who wants to type a
 * `2` would have to switch back first. Only the function rows swap.
 */
export const PAD_KEYS = [
  [
    { label: '7', insert: '7' },
    { label: '8', insert: '8' },
    { label: '9', insert: '9' },
    { label: '÷', insert: '/' },
    { label: '⌫', action: 'back' },
  ],
  [
    { label: '4', insert: '4' },
    { label: '5', insert: '5' },
    { label: '6', insert: '6' },
    { label: '×', insert: '*' },
    { label: 'eˣ', insert: 'exp(', fn: true, title: 'exp' },
  ],
  [
    { label: '1', insert: '1' },
    { label: '2', insert: '2' },
    { label: '3', insert: '3' },
    { label: '−', insert: '-' },
    { label: 'C', action: 'clear' },
  ],
  [
    { label: '0', insert: '0' },
    { label: '.', insert: '.' },
    { label: '(', insert: '(' },
    { label: ')', insert: ')' },
    { label: '1/x', insert: '1/' },
  ],
  [
    { label: '+', insert: '+' },
    // Spans the four remaining columns: the output row holds one operator and
    // the key that evaluates, and a two-column `=` beside three empty cells
    // would look like a mistake.
    { label: '=',
      action: 'equals',
      span: 4 },
  ],
];

/** The unit symbols a user is most likely to type, as one-tap insertions. */
const UNIT_KEYS = ['g', 'mL', 'L', 'mol', 'M', 'cm3'];

/**
 * A second function page, swapped in over the first by the switch above the
 * keypad.
 *
 * A keypad has room for four function rows and the common functions fill them.
 * Rather than dropping the rest — which is how a calculator ends up unable to
 * do something a user expects — the less common ones live on a page of their
 * own.
 *
 * Only the *functions* swap. The brackets, clear and backspace stay in the
 * blocks around this one, because those are entry controls rather than
 * functions, and a user reaching for clear should not have to know which page
 * they are on to find it.
 *
 * These are the ones a general calculator has that the first page does not: the
 * integer and sign functions, the multi-argument ones, and the log bases that
 * make `log`'s meaning explicit rather than assumed.
 *
 * π and e repeat from the first page on purpose — they are reached for
 * constantly, and leaving the page to get back to them would be a small tax on
 * the most common thing a user does here. `eˣ` is not repeated, because it is
 * already in the digit block, which does not swap.
 */
export const FN_KEYS = [
  [
    { label: 'x^y', insert: '^', fn: true, title: 'power' },
    { label: 'x²', insert: '^2', fn: true, title: 'square' },
    { label: '√', insert: 'sqrt(', fn: true, title: 'sqrt' },
    { label: '∛', insert: 'cbrt(', fn: true, title: 'cbrt' },
    { label: '|x|', insert: 'abs(', fn: true, title: 'abs' },
  ],
  [
    { label: 'round', insert: 'round(', fn: true, title: 'round' },
    { label: 'floor', insert: 'floor(', fn: true, title: 'floor' },
    { label: 'ceil', insert: 'ceil(', fn: true, title: 'ceil' },
    { label: 'trunc', insert: 'trunc(', fn: true, title: 'trunc' },
    { label: 'sign', insert: 'sign(', fn: true, title: 'sign' },
  ],
  [
    { label: 'min', insert: 'min(', fn: true, title: 'min' },
    { label: 'max', insert: 'max(', fn: true, title: 'max' },
    { label: 'hypot', insert: 'hypot(', fn: true, title: 'hypot' },
    { label: 'atan2', insert: 'atan2(', fn: true, title: 'atan2' },
    // The argument separator, on the same row as the functions that take more
    // than one. Without it `hypot(`, `min(`, `max(` and `atan2(` are keys that
    // open a call the on-screen keypad cannot finish — on a phone, where there
    // is no comma on the keyboard, they would be dead ends.
    { label: ',', insert: ',', title: 'comma' },
  ],
  [
    { label: 'log₂', insert: 'log2(', fn: true, title: 'log2' },
    { label: 'log₁₀', insert: 'log10(', fn: true, title: 'log10' },
    /*
     * `10ˣ` inserts the whole base rather than an operator, so it behaves like
     * `√` or `π`: press it and you have started a value. A key that leaves the
     * entry as a bare operator (`^`) is a key the next press can only follow,
     * never precede — and off the keypad alone, `10^-7` is the single most
     * common thing a chemist types here, so it has to work in that order.
     */
    { label: '10ˣ', insert: '10^', fn: true, title: 'pow10' },
    { label: 'π', insert: 'pi', title: 'pi' },
    { label: 'e', insert: 'e', title: 'e' },
  ],
];

/**
 * A calculator available from every tab.
 *
 * A drawer rather than a tab, because a calculation is a detour: a student
 * working out a dilution needs an intermediate molar mass without losing the
 * form they are filling in. A tab would replace the work; a drawer sits over
 * it and closes again.
 *
 * It shares the expression engine with the converter tab, which is the point —
 * the same `5 g / 250 mL` works in both, and there is one implementation of
 * what a unit means rather than two that drift.
 */
export default function CalculatorDrawer({ open, onClose, store }) {
  const { t } = useI18n();
  const [src, setSrc] = useState('');
  const [degrees, setDegrees] = useState(false);
  // Whether a numeric field is currently claiming the fill target. Tracked in
  // state so the button appears and disappears as focus moves.
  const [canFillHere, setCanFillHere] = useState(false);
  const [filled, setFilled] = useState(false);
  // Which function page the keypad shows. See FN_KEYS.
  const [fnPage, setFnPage] = useState(false);
  const inputRef = useRef(null);

  /*
   * The window's position, remembered between sessions.
   *
   * A user who moves the calculator out of the way of the form they are filling
   * in should not have to move it again on the next calculation. The position
   * is clamped on read as well as on write: the stored value may be from a
   * wider window, and a position that was on screen then can be off it now.
   */
  const [pos, setPos] = useState(() => loadPosition(store) ?? { x: 0, y: 0 });
  const [placed, setPlaced] = useState(false);
  const winRef = useRef(null);
  const headRef = useRef(null);
  const drag = useRef(null);

  const viewport = () => ({
    width: globalThis.innerWidth ?? 1440,
    height: globalThis.innerHeight ?? 900,
  });

  // Place the window the first time it opens, once its size is known. Before
  // that the element has no measured height, so a default computed from it
  // would be wrong.
  useEffect(() => {
    if (!open || placed) return;
    const el = winRef.current;
    if (!el) return;
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const stored = loadPosition(store);
    const next = clampPosition(
      stored ?? defaultPosition(size, viewport()),
      size, viewport(),
    );
    setPos(next);
    setPlaced(true);
  }, [open, placed, store]);

  // Keep the window reachable when the viewport shrinks — a rotate, or a
  // window resize. Without this a window parked at the bottom right ends up
  // off screen and cannot be recovered without clearing storage.
  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => {
      const el = winRef.current;
      if (!el) return;
      setPos((p) => clampPosition(
        p, { width: el.offsetWidth, height: el.offsetHeight }, viewport(),
      ));
    };
    globalThis.addEventListener?.('resize', onResize);
    return () => globalThis.removeEventListener?.('resize', onResize);
  }, [open]);

  useEffect(() => { if (placed) savePosition(store, pos); }, [store, pos, placed]);

  /*
   * Dragging, via pointer events rather than mouse events.
   *
   * Pointer events cover mouse, touch and pen in one path, and
   * `setPointerCapture` keeps the drag alive when the cursor outruns the title
   * bar — with mouse events the window stops following the moment the pointer
   * leaves the handle, which happens on any fast drag.
   *
   * ## Why the move and up handlers are on the window, not the title bar
   *
   * `setPointerCapture` on the window retargets every subsequent pointer event
   * for that pointer to the window — so a `pointerup` delivered over the title
   * bar never reaches the title bar. With the handlers bound there, the up was
   * never seen, `drag.current` was never cleared, and the window kept following
   * the cursor on plain hover afterwards. That is the "it sticks to the mouse
   * as soon as you touch the top" report.
   *
   * Bound on the window, the handlers sit exactly where the captured events are
   * delivered, so the release is always seen.
   *
   * The `buttons` check is the second half of the same fix. A `pointermove`
   * with no button held is a hover, not a drag, and must be ignored even if
   * some path left the drag state set. Belt and braces, because the failure it
   * prevents — a window that follows the pointer with nothing pressed — looks
   * like the app is possessed.
   */
  const onPointerDown = useCallback((e) => {
    if (!isDragHandle(e.target, headRef.current)) return;
    // Primary button only: a right-click on the title bar must not start a drag
    // and swallow the context menu.
    if (e.button !== 0) return;
    const el = winRef.current;
    if (!el) return;
    e.preventDefault();
    /*
     * Capture is best-effort, and the drag must not depend on it.
     *
     * `setPointerCapture` throws `NotFoundError` when the pointer id is not one
     * the browser is tracking — which happens with a synthetic event, and can
     * happen for real when the pointer is released between the event firing and
     * this line running. Unguarded, that exception aborts the handler before
     * `drag.current` is set, so the window simply refuses to move and the cause
     * is invisible.
     *
     * Without capture the drag still works for a slow move; it only stops
     * following if the cursor outruns the title bar, which is the lesser
     * failure.
     */
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // Not fatal: the drag proceeds uncaptured.
    }
    drag.current = { id: e.pointerId, from: { x: e.clientX, y: e.clientY }, start: pos };
  }, [pos]);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    // Ignore a move for a different pointer, and any move with nothing held.
    if (e.pointerId !== d.id) return;
    if (e.buttons === 0) { drag.current = null; return; }
    const el = winRef.current;
    const size = { width: el?.offsetWidth ?? 420, height: el?.offsetHeight ?? 560 };
    setPos(clampPosition(
      dragTo(d.start, d.from, { x: e.clientX, y: e.clientY }), size, viewport(),
    ));
  }, []);

  const onPointerUp = useCallback((e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    try {
      winRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      // Already released, or never captured. Either way the drag is over.
    }
  }, []);

  /*
   * Bind the move and up handlers for the duration of a drag.
   *
   * On the window rather than on the title bar, for the capture reason above.
   * Mounted only while dragging, so a pointermove anywhere on the page costs
   * nothing when the window is not being moved.
   */
  useEffect(() => {
    if (!open) return undefined;
    globalThis.addEventListener?.('pointermove', onPointerMove);
    globalThis.addEventListener?.('pointerup', onPointerUp);
    globalThis.addEventListener?.('pointercancel', onPointerUp);
    return () => {
      globalThis.removeEventListener?.('pointermove', onPointerMove);
      globalThis.removeEventListener?.('pointerup', onPointerUp);
      globalThis.removeEventListener?.('pointercancel', onPointerUp);
    };
  }, [open, onPointerMove, onPointerUp]);

  // Focus the field when the window opens, so the keyboard is usable without a
  // click. Restoring focus on close is left to the browser: the window is
  // opened by a shortcut or a button, and both keep their own focus.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const insert = useCallback((text) => {
    setSrc((s) => s + text);
    inputRef.current?.focus();
  }, []);

  const back = useCallback(() => {
    setSrc((s) => s.slice(0, -1));
    inputRef.current?.focus();
  }, []);

  const clear = useCallback(() => {
    setSrc('');
    inputRef.current?.focus();
  }, []);

  /*
   * One key, drawn the same way on both blocks of the keypad.
   *
   * The function block and the digit block differ only in which rows they walk
   * — the keys mean the same things — so they share this rather than each
   * carrying its own copy that could drift in styling or in how a key with no
   * `insert` is handled.
   */
  const renderKey = useCallback((k) => (
    <button
      key={k.label}
      type="button"
      className={`calc-key${k.fn ? ' is-fn' : ''}`}
      // The wide `=` is the only spanning key, and a `span N` is a single
      // property rather than a rule per width, so it is inline.
      style={k.span ? { gridColumn: `span ${k.span}` } : undefined}
      title={k.title ? t(`convert.calcKey_${k.title}`) : undefined}
      onClick={() => {
        if (k.action === 'clear') clear();
        else if (k.action === 'back') back();
        else if (k.action === 'equals') inputRef.current?.focus();
        else insert(k.insert);
      }}
    >
      {k.label}
    </button>
  ), [t, clear, back, insert]);

  /*
   * Degrees are a conversion at the edge, not a parser mode.
   *
   * When the toggle is on, a bare number inside a trig call is converted to
   * radians before evaluation. Doing it here rather than in the parser keeps
   * the parser's meaning fixed: `sin(pi/2)` is 1 whether or not the toggle is
   * on, because it is already in radians and only bare degrees are rewritten.
   */
  const source = useMemo(() => {
    if (!degrees) return src;
    return src.replace(
      /\b(sin|cos|tan)\(\s*(-?\d+(?:\.\d+)?)\s*\)/g,
      (_, fn, n) => `${fn}((${n})*pi/180)`,
    );
  }, [src, degrees]);

  const result = useMemo(() => {
    const text = source.trim();
    if (text === '') return null;
    try {
      const r = evaluate(text);
      return { value: r.value, unit: r.unit, dimension: r.dimension, error: null };
    } catch (e) {
      return { value: null, error: errorMessage(e, t) };
    }
  }, [source, t]);

  // Escape closes, which is what every overlay in this app does.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /*
   * Watch which field is claiming the fill target.
   *
   * Re-read on every render while open as well as on subscription, because the
   * target can be claimed by a field that mounted before this window opened —
   * the user focuses an input, then opens the calculator, and no change event
   * fires in between.
   */
  useEffect(() => {
    if (!open) return undefined;
    setCanFillHere(canFill());
    return onFieldChange(() => setCanFillHere(canFill()));
  }, [open]);

  if (!open) return null;

  const dimLabel = result?.dimension
    ? (DIMENSION_KEYS.includes(result.dimension)
      ? t(`convert.dim_${result.dimension}`)
      : result.dimension)
    : null;

  return (
    <>
      {/* No scrim: the window stays put while the form behind it is used. See
          the note where `.calc-scrim` used to be in styles.css. */}
      <aside
        ref={winRef}
        className="calc-drawer"
        role="dialog"
        aria-modal="false"
        aria-label={t('convert.calcTitle')}
        style={{ left: pos.x, top: pos.y }}
      >
        {/* Only `pointerdown` is bound here; the move and up handlers live on
            the window, because that is where a captured pointer's events are
            delivered. See the note on `onPointerMove`. */}
        <header
          className="calc-head"
          ref={headRef}
          onPointerDown={onPointerDown}
          style={{ cursor: 'grab' }}
        >
          <h2>{t('convert.calcTitle')}</h2>
          <div className="calc-head-actions">
            <button
              type="button"
              className={`calc-mode${degrees ? ' is-on' : ''}`}
              aria-pressed={degrees}
              onClick={() => setDegrees((v) => !v)}
            >
              {degrees ? 'DEG' : 'RAD'}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label={t('convert.calcClose')}
              title={t('convert.calcClose')}
            >
              <Icons.close size={ICON_SIZE.control} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="calc-body">
          <input
            ref={inputRef}
            className="calc-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck="false"
            value={src}
            placeholder={t('convert.calcPlaceholder')}
            onChange={(e) => setSrc(e.target.value)}
            aria-label={t('convert.calcLabel')}
          />

          <div className="calc-readout" role="status" aria-live="polite">
            {result === null && <span className="calc-idle">{t('convert.calcEmpty')}</span>}
            {result?.error && <span className="calc-error">{result.error}</span>}
            {result && !result.error && (
              <>
                <span className="calc-value">{fmt(result.value, 10)}</span>
                {result.unit && <span className="calc-unit">{result.unit}</span>}
                {dimLabel && <span className="calc-dim">{dimLabel}</span>}
              </>
            )}
          </div>

          {/* Filling the field behind the window is the reason the window can
              stay open at all. It appears only when a numeric field has been
              focused, so it never offers to write somewhere there is nowhere
              to write to. */}
          {canFillHere && result && !result.error && (
            <button
              type="button"
              className="calc-fill"
              onClick={() => {
                /*
                 * Write the value at the precision a person can use.
                 *
                 * `String(result.value)` gives all seventeen digits a double
                 * carries — `2.1389459274469544` for a perfectly ordinary
                 * dilution — which is unreadable in a form field, and false
                 * precision besides: the calculator's own readout shows ten
                 * significant figures, so the rest is noise the user cannot
                 * check. Twelve significant figures is more than any bench
                 * measurement justifies and short enough to read at a glance.
                 *
                 * `Number(...)` at the end strips the trailing zeros that
                 * `toPrecision` pads with, so 0.500000000000 comes back as 0.5.
                 */
                const text = Number(result.value.toPrecision(12)).toString();
                if (fillField(text)) {
                  setFilled(true);
                  window.setTimeout(() => setFilled(false), 1600);
                }
              }}
            >
              <Icons.check size={ICON_SIZE.inline} aria-hidden="true" />
              {filled ? t('convert.calcFilled') : t('convert.calcFill')}
            </button>
          )}

          <div className="calc-units" role="group" aria-label={t('convert.calcUnits')}>
            {UNIT_KEYS.map((u) => (
              <button key={u} type="button" className="calc-chip" onClick={() => insert(` ${u}`)}>
                {u}
              </button>
            ))}
          </div>

          {/* The page switch. It sits above the keypad rather than among the
              keys so it is never mistaken for a key that inserts something —
              every other button here types a character. */}
          <button
            type="button"
            className={`calc-page${fnPage ? ' is-on' : ''}`}
            aria-pressed={fnPage}
            onClick={() => setFnPage((v) => !v)}
            title={t('convert.calcMore')}
          >
            <Icons.calc size={ICON_SIZE.inline} aria-hidden="true" />
            {fnPage ? t('convert.calcPage1') : t('convert.calcPage2')}
          </button>

          <div className="calc-keypad" role="group" aria-label={t('convert.calcKeypad')}>
            {(fnPage ? FN_KEYS : COMMON_KEYS).map((row, ri) => (
              <div className="calc-row" key={ri}>
                {row.map(renderKey)}
              </div>
            ))}
            {/* The digits are not part of either page: they stay put while the
                function rows above them swap, so a user on the second page can
                still type a number. */}
            {PAD_KEYS.map((row, ri) => (
              <div className="calc-row" key={`pad-${ri}`}>
                {row.map(renderKey)}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
