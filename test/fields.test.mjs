// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import { NumField } from '../src/ui/components/Fields.jsx';

/**
 * The number field, as the user drives it.
 *
 * ## The bug these exist for
 *
 * Clearing a field and pressing the tab's button reused the **previous** value.
 * Reproduced in the browser before writing these: `目标浓度` at `0.5` gave
 * 14.61 g; clearing the box and pressing 计算 gave 14.61 g again, with the box
 * empty and no error.
 *
 * The cause is in the component, not the calc layer. `draft` holds what is
 * typed and `value` is what the tab holds; the field shows `draft ?? value`.
 * An empty box parses to `null` — correctly, because "nothing" is not a number
 * — and `null` means "leave the tab's value alone". So the tab kept `0.5`
 * while the box showed nothing.
 *
 * Then `onBlur` clears the draft, and the field re-renders from `value` — the
 * stale `0.5` **reappears in the box the user just emptied**. That is the same
 * complaint from the other direction: the number comes back after being
 * deleted.
 *
 * ## What is asserted, and why not the blur
 *
 * The assertion is on **what the tab is told**, because that is the layer the
 * bug lives at: an empty box must report `''` rather than stay silent.
 *
 * The "reappears" half is not asserted here, and deliberately. jsdom does not
 * reproduce it — React leaves a user-typed value on the node when the incoming
 * prop is unchanged, so a test for it passes before and after the fix and
 * proves nothing. It was measured in the real app instead (`.tmp/diag/`), and
 * the fix covers it because once the tab is told `''` there is no stale value
 * left for blur to fall back to.
 *
 * These tests mount the real component with the real provider, because the bug
 * is in the interaction between draft state and the parse result — neither of
 * which a unit test of `readNumberField` can see.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Mount with the provider the component's `useI18n` needs.
 *
 * The value is held in real React state, the way every tab holds it — not
 * pinned as a constant prop. That distinction is load-bearing: a constant
 * `value="0.5"` never changes, so React sees the same prop on the next render
 * and leaves the DOM node's user-typed text alone, and the "text reappears"
 * bug hides. A tab passes `useState`'s setter, so its re-render does change
 * the prop and the stale value does come back.
 */
async function mountField({ label, initial, onChange: spy = () => {} }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  // A stand-in for a tab: real state, so the field is driven the way the app
  // drives it.
  function Host() {
    const [v, setV] = React.useState(initial ?? '');
    return React.createElement(NumField, {
      label,
      value: v,
      onChange: (next) => { spy(next); setV(next); },
    });
  }

  await act(async () => {
    root.render(
      React.createElement(LocaleProvider, { store: null },
        React.createElement(Host)),
    );
  });
  const input = container.querySelector('input');
  return {
    container,
    input,
    /** Type into the field the way a user does: native setter + input event. */
    type: async (text) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      await act(async () => {
        setter.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    blur: async () => { await act(async () => { input.blur(); }); },
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { document.body.innerHTML = ''; });

describe('NumField: clearing the field', () => {
  it('should report the cleared field as empty rather than leaving the old value', async () => {
    // The whole bug in one assertion: after clearing, the tab must not still
    // be holding 0.5. `''` is what a consumer can refuse; `'0.5'` is a number
    // the user deleted and would then be calculated with.
    const seen = [];
    const f = await mountField({ label: '目标浓度', initial: '0.5', onChange: (v) => seen.push(v) });
    await f.type('');
    expect(seen).toEqual(['']);
    await f.unmount();
  });

  it('should keep the box empty after it loses focus', async () => {
    // The other half: `onBlur` drops the draft and the field falls back to
    // `value`. With the tab still holding the old number, the number the user
    // deleted reappeared in the box.
    const f = await mountField({ label: '目标浓度', initial: '0.5' });
    await f.type('');
    await f.blur();
    expect(f.input.value).toBe('');
    await f.unmount();
  });

  it('should still pass an ordinary number through as a string', async () => {
    // The existing contract, kept: a plain number reaches the tab as text so
    // the expression path and the plain path stay indistinguishable upstream.
    const seen = [];
    const f = await mountField({ label: '定容体积', initial: '', onChange: (v) => seen.push(v) });
    await f.type('250');
    expect(seen).toEqual(['250']);
    await f.unmount();
  });

  it('should leave the tab alone while the text is an unreadable partial', async () => {
    // `abc` is neither empty nor a number. Changing the tab to NaN on it would
    // blank the result of a working calculation mid-typing, which is a
    // different bug from the one being fixed. Only *empty* is a signal.
    const seen = [];
    const f = await mountField({ label: '定容体积', initial: '500', onChange: (v) => seen.push(v) });
    await f.type('abc');
    expect(seen).toEqual([]);
    await f.unmount();
  });

  it('should treat whitespace as empty, the same as nothing typed', async () => {
    // A user who pressed space instead of backspace has cleared the field too.
    const seen = [];
    const f = await mountField({ label: '定容体积', initial: '500', onChange: (v) => seen.push(v) });
    await f.type('   ');
    expect(seen).toEqual(['']);
    await f.unmount();
  });
});
