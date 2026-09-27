/**
 * The bridge that lets the calculator fill in the field you were editing.
 *
 * ## Why a module and not props
 *
 * The calculator is mounted at the app root and the fields live inside fifteen
 * different tabs, several levels down. Threading a callback from the root into
 * every `NumField` would mean every tab taking a prop it does not use, and a
 * new tab forgetting it would fail silently — the button would just never
 * appear.
 *
 * So the fields register themselves here and the calculator asks. The
 * dependency runs one way: the fields know about this module, the calculator
 * knows about this module, and neither knows about the other.
 *
 * ## What "the field you were editing" means
 *
 * Focus is the signal. When a numeric field takes focus it becomes the target;
 * when it loses focus it stays the target, because the user's next action is
 * clicking into the calculator — which is exactly the moment focus leaves. Only
 * a *different* numeric field taking focus replaces it.
 *
 * A target that has since unmounted (a tab change, a dynamic row removed) is
 * dropped rather than written to, so a value cannot land in a field that is no
 * longer on screen.
 */

/** The element currently accepting a filled value, or null. */
let target = null;

/**
 * What that field is called, in the reader's language.
 *
 * The button says 「填入 目标浓度 (mol/L)」 rather than 「填入字段」. A target
 * survives losing focus — the user's next action is clicking into the
 * calculator, which is the moment focus leaves — so by the time the button is
 * visible the field may have been focused several tabs ago, and a button that
 * does not name it gives no way to tell which box the number is about to land
 * in. The label is the same string the field renders above itself, passed in by
 * the field rather than looked up, so the two cannot disagree.
 */
let targetLabel = null;

/** Listeners, so the calculator can show or hide its fill button reactively. */
const listeners = new Set();

function announce() {
  for (const fn of listeners) fn(target);
}

/**
 * Register a field as the fill target.
 *
 * `label` is optional: a caller that does not have one still gets a working
 * fill, it just cannot be named. Returns the unregister function, so a caller
 * can pass it straight to an effect's cleanup.
 */
export function claimField(el, label) {
  target = el;
  targetLabel = typeof label === 'string' && label.trim() !== '' ? label : null;
  announce();
  return () => {
    // Only clear if we are still the current target — otherwise unmounting an
    // old field would wipe a newer one that had already taken over.
    if (target === el) {
      target = null;
      targetLabel = null;
      announce();
    }
  };
}

/** The current target, or null. */
export function currentField() {
  return target;
}

/** What the current target is called, or null when there is none. */
export function currentFieldLabel() {
  return target && target.isConnected ? targetLabel : null;
}

/**
 * Drop the target.
 *
 * Only for tests and for a caller that knows the whole form has gone; ordinary
 * unmounting goes through the release function `claimField` returns.
 */
export function clearField() {
  target = null;
  targetLabel = null;
  announce();
}

/**
 * Whether a field can be filled right now.
 *
 * The element must still be in the document: a tab switch unmounts the field
 * without any event this module can hook, so liveness is checked on read
 * rather than trusted from registration time.
 */
export function canFill() {
  return !!(target && target.isConnected);
}

/**
 * Write a value into the target field.
 *
 * Dispatches a real `input` event rather than setting `.value` alone. React
 * tracks the previous value on the DOM node, and a bare assignment leaves that
 * tracker stale — the next keystroke would then be diffed against the old value
 * and the field would appear to swallow it. The native setter plus a bubbling
 * `input` event is what makes React see the change as user input.
 *
 * @returns {boolean} whether the value was written
 */
export function fillField(text) {
  const el = currentField();
  if (!el || !el.isConnected) return false;

  /*
   * Find the native `value` setter by walking up from the element itself.
   *
   * Not `instanceof HTMLInputElement`: that needs a DOM global, which is absent
   * outside a browser, and it says nothing about a `<textarea>` or a future
   * control. The setter lives on whichever prototype in the chain owns it, and
   * searching for it is both more general and testable without a DOM.
   *
   * Calling the *native* setter is the point. React installs its own `value`
   * property on the node to track the last rendered value; assigning through
   * that tracker updates the tracker without React seeing a change, and the
   * next keystroke is then diffed against a value React never learned about.
   * Bypassing to the prototype setter is what makes the assignment look like
   * user input.
   */
  let proto = el;
  let setter = null;
  while (proto && !setter) {
    setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    proto = Object.getPrototypeOf(proto);
  }
  if (!setter) return false;

  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/** Subscribe to target changes. Returns an unsubscribe function. */
export function onFieldChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
