/**
 * The keyboard shortcuts, as data.
 *
 * ## Why this is a module rather than a `switch` in a handler
 *
 * Three reasons, and the third is the one that forced it. The list is shown to
 * the user in the settings popover, so the key and its description have to be
 * in the same place or they drift — a help panel that lists a shortcut that no
 * longer works is worse than no help panel. The matching is pure, so it can be
 * tested without a DOM. And a `switch` on `e.key` scattered through a component
 * is where "why did my typing get swallowed" bugs live.
 *
 * ## Which shortcuts work while typing, and why it is per-shortcut
 *
 * The rule cannot be global, and both global rules are wrong.
 *
 * "Nothing fires while a field has focus" breaks `Ctrl+K`: the calculator
 * focuses its own entry when it opens, so the shortcut that opened it could
 * never close it — measured, and the window was stuck open until Escape.
 *
 * "Everything fires" breaks the arrows: `Ctrl+←` and `Ctrl+→` move the caret a
 * word at a time in a text field, so a user editing an entry would switch tabs
 * instead of moving the cursor.
 *
 * The distinction that actually holds is whether the combination *produces
 * text or has a native meaning in the field*. `Ctrl+K` and `Ctrl+J` do neither,
 * so they are safe everywhere; `Ctrl+Arrow` moves the caret, and a bare `?` is
 * a character, so both are suppressed while typing.
 */

/** Elements whose keystrokes belong to them and not to the app. */
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Whether the focus is somewhere the user is entering text. */
export function isTyping(activeElement) {
  const el = activeElement ?? null;
  if (!el) return false;
  return TYPING_TAGS.has(el.tagName) || el.isContentEditable === true;
}

/**
 * Whether a keystroke should be left alone entirely.
 *
 * True when a modifier the browser or the OS owns is held — Alt+Left is Back,
 * Cmd+1 is a browser tab, and swallowing those is how an app takes over the
 * window — or when an input method is composing. A Chinese or Japanese IME
 * sends a `keydown` for every keystroke of a candidate, and a handler that
 * acted on them would navigate the app while the user is writing a word.
 */
export function shouldIgnore(event) {
  if (!event) return true;
  if (event.isComposing || event.keyCode === 229) return true;
  if (event.altKey || event.metaKey) return true;
  return false;
}

/**
 * Which shortcut a keystroke is, or null.
 *
 * Deliberately tiny. The tab-cycling keys are arrows rather than digits,
 * because a calculator has sixteen tabs and a digit would collide with the
 * keypad's own digits the moment the drawer is open.
 *
 * `?` is Shift+/ on most layouts but not on all of them, so the check is on the
 * character the browser reports rather than on the key and modifier.
 */
export function matchShortcut(event) {
  if (!event) return null;
  const key = String(event.key ?? '');
  if (event.ctrlKey && !event.shiftKey && key.toLowerCase() === 'k') return 'calc';
  if (event.ctrlKey && !event.shiftKey && key === '/') return 'help';
  if (event.ctrlKey && !event.shiftKey && key === 'ArrowRight') return 'nextTab';
  if (event.ctrlKey && !event.shiftKey && key === 'ArrowLeft') return 'prevTab';
  if (event.ctrlKey && !event.shiftKey && key.toLowerCase() === 'j') return 'focusWork';
  if (event.key === '?') return 'help';
  return null;
}

/**
 * The shortcuts, with the keys a person would press and their descriptions.
 *
 * Ordered by how often they are reached for, not alphabetically. `typing: true`
 * marks the two that must not fire while the user is editing a field — see the
 * note at the top for why that is a per-shortcut decision.
 *
 * `keys` is the display form; the matching is in `matchShortcut` above. They
 * are kept adjacent so a change to one is hard to make without seeing the
 * other.
 */
export const SHORTCUTS = [
  { action: 'calc', keys: ['Ctrl', 'K'], label: 'app.scCalc' },
  { action: 'focusWork', keys: ['Ctrl', 'J'], label: 'app.scFocus' },
  { action: 'nextTab', keys: ['Ctrl', '→'], label: 'app.scTabs', typing: true },
  { action: 'prevTab', keys: ['Ctrl', '←'], label: 'app.scTabs', typing: true },
  { action: 'help', keys: ['?'], label: 'app.scHelp', typing: true },
];

/** Whether an action may fire while a field has focus. */
export function worksWhileTyping(action) {
  return !SHORTCUTS.some((s) => s.action === action && s.typing);
}

/**
 * The next tab id, wrapping.
 *
 * Wrapping rather than stopping at the end: a user pressing Ctrl+→ repeatedly
 * is looking for something, and a key that stops responding at the last tab
 * makes them press the other arrow to get back. `direction` is +1 or -1.
 */
export function cycleTab(ids, current, direction) {
  if (!Array.isArray(ids) || ids.length === 0) return current;
  const at = ids.indexOf(current);
  // An unknown current tab starts from the beginning rather than returning
  // `undefined`, which would leave the app on a tab that does not exist.
  if (at < 0) return ids[0];
  return ids[(at + direction + ids.length) % ids.length];
}
