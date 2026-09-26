import { describe, it, expect, beforeEach, vi } from 'vitest';
import { claimField, currentField, canFill, fillField, onFieldChange } from '../src/ui/field-bridge.mjs';

/**
 * A minimal stand-in for an input element.
 *
 * `fillField` goes through the prototype's `value` setter and dispatches a real
 * `input` event, because that is what React needs to notice the change. The
 * fake has to model both, or the test would pass against an implementation that
 * does not work in a browser.
 */
/*
 * The `value` setter lives on a prototype, not on the instance.
 *
 * That is where it lives on a real DOM node, and `fillField` walks the chain to
 * find it — so putting it on the instance would make the fake pass against an
 * implementation that does not work on a real element.
 */
const FakeProto = {
  get value() { return this._value; },
  set value(v) { this._value = v; },
};

function fakeInput() {
  const listeners = new Map();
  const el = Object.create(FakeProto);
  Object.assign(el, {
    isConnected: true,
    _value: '',
    events: [],
    dispatchEvent(e) {
      for (const fn of listeners.get(e.type) ?? []) fn(e);
      return true;
    },
    addEventListener(t, fn) { listeners.set(t, [...(listeners.get(t) ?? []), fn]); },
    removeEventListener(t, fn) {
      listeners.set(t, (listeners.get(t) ?? []).filter((f) => f !== fn));
    },
  });
  el.addEventListener('input', (e) => el.events.push(e.type));
  return el;
}

// The module keeps its target in module scope, so each test starts clean by
// releasing whatever the previous one claimed.
beforeEach(() => {
  claimField(null)();
});

describe('claimField', () => {
  it('should make the field the current target', () => {
    const el = fakeInput();
    claimField(el);
    expect(currentField()).toBe(el);
  });

  it('should replace the previous target when a second field claims', () => {
    // Focus moving between fields is the normal case, not an error.
    const a = fakeInput();
    const b = fakeInput();
    claimField(a);
    claimField(b);
    expect(currentField()).toBe(b);
  });

  it('should release only if still the current target', () => {
    /*
     * Unmounting an old field must not wipe a newer one that has already taken
     * over — React runs cleanups in an order the component cannot control, and
     * a stale cleanup clearing the live target would silently disable the fill
     * button.
     */
    const a = fakeInput();
    const b = fakeInput();
    const releaseA = claimField(a);
    claimField(b);

    releaseA();
    expect(currentField()).toBe(b);
  });

  it('should clear the target when the current field releases', () => {
    const a = fakeInput();
    claimField(a)();
    expect(currentField()).toBeNull();
  });
});

describe('canFill', () => {
  it('should be false with no target', () => {
    expect(canFill()).toBe(false);
  });

  it('should be true for a live target', () => {
    claimField(fakeInput());
    expect(canFill()).toBe(true);
  });

  it('should be false once the target has left the document', () => {
    /*
     * A tab switch unmounts the field without any event this module can hook,
     * so liveness has to be checked on read. Without it a value would be
     * written into a detached node and vanish.
     */
    const el = fakeInput();
    claimField(el);
    el.isConnected = false;
    expect(canFill()).toBe(false);
  });
});

describe('fillField', () => {
  it('should write the value and dispatch a bubbling input event', () => {
    // React tracks the previous value on the node; a bare assignment leaves the
    // tracker stale and the next keystroke appears to be swallowed. The event
    // is what makes React see it as user input.
    const el = fakeInput();
    claimField(el);
    expect(fillField('12.5')).toBe(true);
    expect(el.value).toBe('12.5');
    expect(el.events).toEqual(['input']);
  });

  it('should refuse when nothing is claimed', () => {
    expect(fillField('1')).toBe(false);
  });

  it('should refuse when the target has been detached', () => {
    const el = fakeInput();
    claimField(el);
    el.isConnected = false;
    expect(fillField('1')).toBe(false);
    expect(el.value).toBe('');
  });

  it('should preserve full precision rather than a rounded readout', () => {
    // The calculator rounds to ten significant figures for display; writing the
    // rounded text back would lose precision on every round trip.
    const el = fakeInput();
    claimField(el);
    fillField('0.123456789012345');
    expect(el.value).toBe('0.123456789012345');
  });
});

describe('onFieldChange', () => {
  it('should notify subscribers when the target changes', () => {
    const seen = [];
    const off = onFieldChange((t) => seen.push(t));

    const el = fakeInput();
    claimField(el);
    claimField(null)();
    off();

    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]).toBe(el);
    expect(seen.at(-1)).toBeNull();
  });

  it('should stop notifying once unsubscribed', () => {
    const fn = vi.fn();
    onFieldChange(fn)();
    claimField(fakeInput());
    expect(fn).not.toHaveBeenCalled();
  });
});
