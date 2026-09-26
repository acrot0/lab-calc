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
  clampPosition, defaultPosition, dragTo, isDragHandle, keyboardInset,
} from '../float-window.mjs';
import {
  DIGIT_KEYS, FN_PAGES, MEMORY_KEYS, UNIT_KEYS,
} from './calculator-keys.mjs';
import { ACTIONS, asQuantity } from './calculator-actions.mjs';
import UnitConverter from './UnitConverter.jsx';

/** Where the window was last left, so it reopens where the user put it. */
const POSITION_KEY = 'lab-calc.calcPos.v1';

/**
 * How many past expressions to keep.
 *
 * Session-scoped and never persisted. The history is there to save re-typing
 * within one sitting; writing it to storage would put a student's working on
 * disk with no way to clear it, which is not a thing this app should do without
 * being asked.
 */
const HISTORY_LIMIT = 12;

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
 * A calculator available from every tab.
 *
 * A drawer rather than a tab, because a calculation is a detour: a student
 * working out a dilution needs an intermediate molar mass without losing the
 * form they are filling in. A tab would replace the work; a drawer sits over it
 * and closes again.
 *
 * It shares the expression engine with the converter tab, which is the point —
 * the same `5 g / 250 mL` works in both, and there is one implementation of what
 * a unit means rather than two that drift.
 *
 * ## The keypad is declared in `calculator-keys.mjs`
 *
 * The tables moved out when this file passed 600 lines. What is left here is the
 * behaviour: where the window sits, what the software keyboard is doing, how a
 * key changes the entry, and what the memory holds.
 */
export default function CalculatorDrawer({ open, onClose, store }) {
  const { t } = useI18n();
  const [src, setSrc] = useState('');
  const [degrees, setDegrees] = useState(false);
  // Whether a numeric field is currently claiming the fill target. Tracked in
  // state so the button appears and disappears as focus moves.
  const [canFillHere, setCanFillHere] = useState(false);
  const [filled, setFilled] = useState(false);
  // Which function page the keypad shows. An index rather than a boolean, so a
  // third page would be a change to the data and not to this component.
  const [fnPage, setFnPage] = useState(0);
  // Which of the window's two panels is showing: the calculator or the unit
  // converter. See the note on `.calc-tabs`.
  const [panel, setPanel] = useState('calc');
  /*
   * Memory, the previous answer, and the recent expressions.
   *
   * All three are session-scoped: they live here and are never written to
   * storage. The previous answer is held as the whole result rather than as a
   * number so its unit survives — see `asQuantity`.
   */
  const [memory, setMemory] = useState(null);
  const [last, setLast] = useState(null);
  const [history, setHistory] = useState([]);
  // Closed by default: the window opens with the whole keypad visible, and the
  // history is the one thing in it that is not part of a calculation. See the
  // note on `.calc-history`.
  const [historyOpen, setHistoryOpen] = useState(false);
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
  /*
   * How far the software keyboard reaches up the viewport.
   *
   * The sheet is anchored to `bottom: 0`, and no viewport unit accounts for the
   * on-screen keyboard — it overlays the page rather than resizing it. Left at
   * zero on a phone, the keyboard covers the bottom rows of the keypad, which
   * is the one thing the sheet exists to show. Published as a custom property
   * so the sheet's own rule consumes it and the breakpoint stays in the
   * stylesheet.
   */
  const [kbInset, setKbInset] = useState(0);
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

  /*
   * Track the software keyboard.
   *
   * Bound only while the window is open, and to `visualViewport` rather than
   * `window` — a keyboard opening does not fire a window resize on either
   * platform, so the `resize` handler above never sees it. `scroll` is bound
   * too because iOS reports the inset through a viewport scroll as the keyboard
   * animates in, and a handler on `resize` alone would catch only the end state.
   *
   * Nothing is bound on a browser without `visualViewport`; `keyboardInset`
   * returns zero and the sheet keeps its unshifted rule.
   */
  useEffect(() => {
    if (!open) return undefined;
    const vv = globalThis.visualViewport;
    if (!vv) return undefined;
    const read = () => setKbInset(keyboardInset(viewport(), vv));
    read();
    vv.addEventListener('resize', read);
    vv.addEventListener('scroll', read);
    return () => {
      vv.removeEventListener('resize', read);
      vv.removeEventListener('scroll', read);
    };
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

  /*
   * Focus the field when the window opens — on a device with a pointer.
   *
   * The focus exists so a hardware keyboard can be typed into without a click.
   * On a touch device it does the opposite of help: focusing summons the
   * software keyboard immediately, which on a phone covers the bottom half of
   * the keypad the user just opened. Someone who opened this window came to
   * press its keys, and the keys should be what is on screen.
   *
   * The field is still reachable by tapping it, which is how a touch user would
   * have got to it anyway. Restoring focus on close is left to the browser: the
   * window is opened by a shortcut or a button, and both keep their own focus.
   */
  useEffect(() => {
    if (!open) return;
    if (globalThis.matchMedia?.('(pointer: coarse)')?.matches) return;
    inputRef.current?.focus();
  }, [open]);

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

  /*
   * The memory and the previous answer, as the engine's variable map.
   *
   * `ans` is the more recently useful of the two when they disagree, and it is
   * the one a user types without thinking, so it is always the last result.
   */
  const vars = useMemo(() => {
    const out = {};
    const a = asQuantity(last);
    if (a) out.ans = a;
    const m = asQuantity(memory);
    if (m) out.mem = m;
    return out;
  }, [last, memory]);

  const live = useMemo(() => {
    const text = source.trim();
    if (text === '') return null;
    try {
      const r = evaluate(text, vars);
      return {
        value: r.value, unit: r.unit, dimension: r.dimension, exponents: r.exponents, error: null,
      };
    } catch (e) {
      return { value: null, error: errorMessage(e, t) };
    }
  }, [source, vars, t]);

  /*
   * A committed answer, held against the entry that produced it.
   *
   * ## Why the readout freezes on `=`
   *
   * `ans` is the previous answer, and `=` is what updates it. That makes the
   * live evaluation self-referential: with `ans * 2` in the entry, pressing `=`
   * sets `ans` to 40 — and the entry, still reading `ans * 2`, immediately
   * re-evaluates against the *new* `ans` and shows 80. The number under the
   * user's finger changes the moment they ask for it, and `M+` then stores the
   * wrong one. Measured: `5 g / 250 mL`, `=`, `ans × 2`, `=`, `M+` put 80 g/L
   * in the memory where the answer on screen was 40.
   *
   * The fix is the behaviour every physical calculator already has: press `=`
   * and the answer is the answer. It stays put until the entry is edited, at
   * which point it goes live again. The frozen value is keyed on the entry text
   * that produced it, so an edit of any kind — a key, a backspace, a paste —
   * releases it without anything having to remember to.
   */
  const [committed, setCommitted] = useState(null);

  const result = useMemo(
    () => (committed && committed.src === src ? committed.result : live),
    [committed, src, live],
  );

  /*
   * The last good result, and the recent expressions.
   *
   * Recorded on `=` rather than on every keystroke: a history of every
   * intermediate state of one expression is not a history. `=` also moves the
   * result into `ans`, which is what makes a chained calculation work without
   * retyping — `5 g / 250 mL`, `=`, then `ans * 2`.
   */
  const evaluateNow = useCallback(() => {
    const text = src.trim();
    if (text === '' || result?.error || result?.value == null) return;
    const next = {
      value: result.value,
      unit: result.unit ?? null,
      exponents: result.exponents ?? [0, 0, 0, 0, 0, 0],
      dimension: result.dimension ?? null,
    };
    setCommitted({ src, result: next });
    setLast(next);
    setHistory((h) => {
      // A repeated expression is moved to the front rather than duplicated:
      // pressing `=` twice on the same sum is a common accident, and two
      // identical rows make the list look broken.
      const without = h.filter((x) => x.text !== text);
      return [{ text, ...next }, ...without].slice(0, HISTORY_LIMIT);
    });
  }, [src, result]);

  /*
   * What the actions need in order to run.
   *
   * Built once per render and handed to whichever action a key names. The
   * registry itself lives in `calculator-actions.mjs` so the key tables can be
   * checked against it without rendering anything — see `test/keypad.test.mjs`.
   */
  const actionCtx = useMemo(() => ({
    setSrc,
    setMemory,
    result,
    last,
    memory,
    commit: evaluateNow,
    // Twelve significant figures, which is more than any bench measurement
    // justifies and short enough that a recalled value does not push the rest
    // of the entry out of the box.
    formatNumber: (v) => Number(v.toPrecision(12)).toString(),
  }), [result, last, memory, evaluateNow]);

  const press = useCallback((k) => {
    if (k.action) {
      ACTIONS[k.action]?.(actionCtx);
      // The entry keeps focus so a hardware keyboard can carry on typing after
      // an on-screen key is pressed, which is how a hybrid device is used.
      inputRef.current?.focus();
      return;
    }
    setSrc((s) => s + k.insert);
    inputRef.current?.focus();
  }, [actionCtx]);

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
        style={{ left: pos.x, top: pos.y, '--kb-inset': `${kbInset}px` }}
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
              title={t('convert.calcAngleMode')}
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

        {/*
          The panel switch.

          A calculator and a unit converter answer the same question at two
          levels — "what is 5 g over 250 mL" and "what is 25 °C in K" — and
          keeping them in one window means neither needs the other's screen.
          The tab strip is above the body so it reads as a property of the
          window rather than of the entry, which is what it is.

          The keypad is not rendered while the converter is showing: the digits
          and `=` would be dead keys there, and a key that does nothing reads as
          a broken window rather than as a different panel.
        */}
        <div className="calc-tabs" role="tablist" aria-label={t('convert.calcTitle')}>
          <button
            type="button"
            role="tab"
            className={`calc-tab${panel === 'calc' ? ' is-on' : ''}`}
            aria-selected={panel === 'calc'}
            onClick={() => setPanel('calc')}
          >
            <Icons.calc size={ICON_SIZE.inline} aria-hidden="true" />
            {t('convert.mode_calc')}
          </button>
          <button
            type="button"
            role="tab"
            className={`calc-tab${panel === 'units' ? ' is-on' : ''}`}
            aria-selected={panel === 'units'}
            onClick={() => setPanel('units')}
          >
            <Icons.convert size={ICON_SIZE.inline} aria-hidden="true" />
            {t('convert.mode_convert')}
          </button>
        </div>

        {panel === 'units' && (
          <div className="calc-body">
            <UnitConverter
              compact
              onFill={canFillHere ? (v) => {
                if (fillField(Number(v.toPrecision(12)).toString())) {
                  setFilled(true);
                  window.setTimeout(() => setFilled(false), 1600);
                }
              } : null}
            />
            {filled && <p className="calc-filled-note">{t('convert.calcFilled')}</p>}
          </div>
        )}

        {panel === 'calc' && (
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
            onKeyDown={(e) => { if (e.key === 'Enter') evaluateNow(); }}
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

          {/*
            The memory indicator.

            It only appears once something has been stored, and it shows the
            value rather than a bare "M" — a memory that says only that it is
            occupied leaves the user to recall what is in it, which on a
            calculator with an `M+` is the whole question.
          */}
          {memory && (
            <div className="calc-mem" role="status">
              <span className="calc-mem-tag">M</span>
              <span className="calc-mem-value">{fmt(memory.value, 8)}</span>
              {memory.unit && <span className="calc-mem-unit">{memory.unit}</span>}
            </div>
          )}

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
              <button key={u} type="button" className="calc-chip" onClick={() => setSrc((s) => `${s} ${u}`)}>
                {u}
              </button>
            ))}
          </div>

          {/*
            The page switch.

            A two-segment control rather than a toggle, because there are two
            pages and a toggle can only say "the other one" — with the page
            count written on each segment, the user can see where they are
            without pressing anything. It sits above the keypad rather than
            among the keys so it is never mistaken for a key that inserts
            something; every other button here types a character.
          */}
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
          </div>

          <div className="calc-keypad" role="group" aria-label={t('convert.calcKeypad')}>
            {/* Only the function rows swap. The memory row and the digits stay
                put, so a user on either page can still type a number, recall
                the answer and clear the entry. */}
            {FN_PAGES[fnPage].map((row, ri) => (
              <div className="calc-row" key={`fn-${ri}`}>
                {row.map(renderKey)}
              </div>
            ))}
            {MEMORY_KEYS.map((row, ri) => (
              <div className="calc-row is-memory" key={`mem-${ri}`}>
                {row.map(renderKey)}
              </div>
            ))}
            {DIGIT_KEYS.map((row, ri) => (
              <div className="calc-row" key={`dig-${ri}`}>
                {row.map(renderKey)}
              </div>
            ))}
          </div>

          {/*
            The recent expressions, behind a disclosure.

            Below the keypad rather than above it, and closed until asked for.
            Both halves of that are about the same thing: the window's cap is
            sized so the whole keypad is on screen when it opens, and a list
            that grew under the keys as the user worked would push the keypad
            up the window and move the digits under the thumb — the exact
            failure the readout's `min-height` exists to prevent. Closed, it
            takes no height at all; opened, it is capped and scrolls inside
            itself, so the keypad moves once and then never again.

            Tapping a row puts the expression back in the entry rather than
            replaying it, so it can be edited before it is evaluated again —
            which is what "that sum again with a different number" needs.
          */}
          {history.length > 0 && (
            <div className={`calc-history${historyOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="calc-history-toggle"
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen((v) => !v)}
              >
                <Icons.history size={ICON_SIZE.inline} aria-hidden="true" />
                {t('convert.calcHistory')}
                <span className="calc-history-count">{history.length}</span>
              </button>
              {historyOpen && (
                <>
                  <ul>
                    {history.map((h) => (
                      <li key={h.text}>
                        <button type="button" onClick={() => setSrc(h.text)} title={h.text}>
                          <span className="calc-history-src">{h.text}</span>
                          <span className="calc-history-out">
                            {fmt(h.value, 8)}{h.unit ? ` ${h.unit}` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="calc-history-clear"
                    onClick={() => setHistory([])}
                  >
                    {t('convert.calcHistoryClear')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        )}
      </aside>
    </>
  );
}
