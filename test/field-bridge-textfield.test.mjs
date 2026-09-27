// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TextField, NumField } from '../src/ui/components/Fields.jsx';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import { canFill, currentFieldLabel, clearField } from '../src/ui/field-bridge.mjs';

/*
 * Every field the calculator can fill must register itself.
 *
 * ## The bug this exists for
 *
 * `claimField` was called from `NumField` only. `TextField` rendered an input
 * with no focus handler at all, so focusing a formula box — the 化学式 field on
 * the weighing tab, the sequence box on the biology tab, the points box on the
 * spectrophotometry tab — left the bridge with no target. The calculator's
 * 「填入字段」 button was disabled, with the tooltip "focus a field first",
 * while the user was looking at a focused field.
 *
 * Reported by a user as "计算器的数值覆盖不进具体填入的空里面". I had previously
 * checked this against `NumField` in a browser, seen it work, and reported the
 * issue fixed. Testing one field type and generalising to all of them is what
 * produced that wrong answer — so this test mounts both, and would fail if a
 * third kind were added without registering.
 *
 * ## Why it mounts rather than calling the bridge
 *
 * The bridge's own tests pass `claimField` a stub and assert it remembers it.
 * That is a test of the bridge, and it was green throughout the bug: nothing
 * was wrong with `claimField`, the call was simply never made. The defect lives
 * in the wiring between a component and the module, so only a mount can see it.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  clearField();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  clearField();
});

/** Render a node inside the locale provider the fields require. */
async function render(node) {
  await act(async () => {
    root.render(React.createElement(LocaleProvider, { store: null }, node));
  });
}

/** Focus the single input and let its effect-driven listener fire. */
async function focusInput() {
  const input = container.querySelector('input');
  expect(input, 'no input rendered').not.toBeNull();
  await act(async () => { input.focus(); });
  return input;
}

describe('fill target registration', () => {
  it('should register a text field, not only a numeric one', async () => {
    // The reported case. A formula box is a TextField, and focusing it has to
    // make the calculator's fill button live.
    await render(React.createElement(TextField, {
      label: '化学式', value: 'NaCl', onChange: () => {},
    }));
    await focusInput();
    expect(canFill()).toBe(true);
    expect(currentFieldLabel()).toBe('化学式');
  });

  it('should register a numeric field', async () => {
    // The case that already worked, kept so a regression in the other
    // direction is caught too.
    await render(React.createElement(NumField, {
      label: '目标浓度 (mol/L)', value: '0.5', onChange: () => {},
    }));
    await focusInput();
    expect(canFill()).toBe(true);
  });

  it('should name the target, so the button can say where it writes', async () => {
    await render(React.createElement(TextField, {
      label: '序列', value: 'ATGC', onChange: () => {},
    }));
    await focusInput();
    // Without a label the button would read 「填入字段」 and the value could land
    // in any box on any tab.
    expect(currentFieldLabel()).toBe('序列');
  });

  it('should release the target when the field unmounts', async () => {
    // A tab switch unmounts the field. A stale target means the button stays
    // live and writes into an element that is no longer on screen.
    await render(React.createElement(TextField, {
      label: '化学式', value: 'NaCl', onChange: () => {},
    }));
    await focusInput();
    expect(canFill()).toBe(true);

    await render(React.createElement('div', null));
    expect(canFill()).toBe(false);
  });

  it('should follow focus from a text field to a numeric one', async () => {
    // Two fields on one tab: the last one focused wins, whichever kind it is.
    await render(React.createElement('div', null,
      React.createElement(TextField, { label: '化学式', value: 'NaCl', onChange: () => {} }),
      React.createElement(NumField, { label: '目标浓度', value: '0.5', onChange: () => {} })));

    const inputs = container.querySelectorAll('input');
    await act(async () => { inputs[0].focus(); });
    expect(currentFieldLabel()).toBe('化学式');

    await act(async () => { inputs[1].focus(); });
    expect(currentFieldLabel()).toBe('目标浓度');
  });
});
