import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { evaluate } from '../../calc/expression.mjs';
import { DIMENSION_KEYS } from '../../calc/units.mjs';
import { fmt } from '../format.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { errorMessage } from '../errors.mjs';
import { Icons, ICON_SIZE } from '../icons.jsx';
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
const KEYS = [
  [
    { label: 'sin', insert: 'sin(', fn: true },
    { label: 'cos', insert: 'cos(', fn: true },
    { label: 'tan', insert: 'tan(', fn: true },
    { label: 'π', insert: 'pi' },
    { label: 'e', insert: 'e' },
  ],
  [
    { label: 'ln', insert: 'ln(', fn: true },
    { label: 'log', insert: 'log(', fn: true },
    { label: 'x²', insert: '^2' },
    { label: 'x^y', insert: '^' },
    { label: '√', insert: 'sqrt(' },
  ],
  [
    { label: 'n!', insert: '!' },
    { label: '%', insert: '%' },
    { label: '(', insert: '(' },
    { label: ')', insert: ')' },
    { label: 'C', action: 'clear' },
  ],
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
    { label: 'eˣ', insert: 'exp(' },
  ],
  [
    { label: '1', insert: '1' },
    { label: '2', insert: '2' },
    { label: '3', insert: '3' },
    { label: '−', insert: '-' },
    { label: '1/x', insert: '1/' },
  ],
  [
    { label: '0', insert: '0' },
    { label: '.', insert: '.' },
    { label: '+', insert: '+' },
    { label: '=',
      action: 'equals',
      wide: true },
  ],
];

/** The unit symbols a user is most likely to type, as one-tap insertions. */
const UNIT_KEYS = ['g', 'mL', 'L', 'mol', 'M', 'cm3'];

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
   */
  const onPointerDown = useCallback((e) => {
    if (!isDragHandle(e.target, headRef.current)) return;
    const el = winRef.current;
    if (!el) return;
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    drag.current = { from: { x: e.clientX, y: e.clientY }, start: pos };
  }, [pos]);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const el = winRef.current;
    const size = { width: el?.offsetWidth ?? 420, height: el?.offsetHeight ?? 560 };
    setPos(clampPosition(
      dragTo(d.start, d.from, { x: e.clientX, y: e.clientY }), size, viewport(),
    ));
  }, []);

  const onPointerUp = useCallback((e) => {
    if (!drag.current) return;
    drag.current = null;
    winRef.current?.releasePointerCapture?.(e.pointerId);
  }, []);

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

  if (!open) return null;

  const dimLabel = result?.dimension
    ? (DIMENSION_KEYS.includes(result.dimension)
      ? t(`convert.dim_${result.dimension}`)
      : result.dimension)
    : null;

  return (
    <>
      {/* The scrim closes the window on click. It is a button rather than a div
          so that it is reachable and announced, and it carries no label of its
          own because the window beside it already names itself. */}
      <button
        type="button"
        className="calc-scrim"
        aria-label={t('convert.calcClose')}
        onClick={onClose}
      />
      <aside
        ref={winRef}
        className="calc-drawer"
        role="dialog"
        aria-modal="false"
        aria-label={t('convert.calcTitle')}
        style={{ left: pos.x, top: pos.y }}
      >
        <header
          className="calc-head"
          ref={headRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
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

          <div className="calc-units" role="group" aria-label={t('convert.calcUnits')}>
            {UNIT_KEYS.map((u) => (
              <button key={u} type="button" className="calc-chip" onClick={() => insert(` ${u}`)}>
                {u}
              </button>
            ))}
          </div>

          <div className="calc-keypad" role="group" aria-label={t('convert.calcKeypad')}>
            {KEYS.map((row, ri) => (
              <div className="calc-row" key={ri}>
                {row.map((k) => (
                  <button
                    key={k.label}
                    type="button"
                    className={`calc-key${k.fn ? ' is-fn' : ''}${k.wide ? ' is-wide' : ''}`}
                    onClick={() => {
                      if (k.action === 'clear') clear();
                      else if (k.action === 'back') back();
                      else if (k.action === 'equals') inputRef.current?.focus();
                      else insert(k.insert);
                    }}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
