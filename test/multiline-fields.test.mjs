// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import { TextField } from '../src/ui/components/Fields.jsx';

/*
 * Fields that say "one per line" must be able to hold a line break.
 *
 * ## The bug these exist for
 *
 * `<input type="text">` cannot contain a newline — the browser strips them as
 * the value is set. Five fields documented "每行一个" were rendered as one:
 * the uncertainty propagation terms, the kinetics and Arrhenius point pairs,
 * the blank replicates, the recovery list.
 *
 * The divergence was invisible at first, which is why it survived. The tab's
 * state kept the real newlines, so the *calculation* was right while the *box*
 * showed `0, 1.0010, 0.8220, 0.67…`. Touching the field ended it the bad way:
 * React wrote the flattened text back into state, five points became one
 * unreadable line, and the tab reported "这几行读不出来" for data the user had
 * not edited. Pasting a spreadsheet column collapsed it a step earlier —
 * `98.2\n97.5` arrives as `98.2975`, a plausible number, so the mean came out
 * over fewer points than the user entered and nothing said so.
 *
 * ## What is asserted
 *
 * The element a multi-line field renders, and that a newline survives a round
 * trip through the component. Both fail on `<input>`: the first because the tag
 * is wrong, the second because jsdom implements the same value sanitisation a
 * browser does, so the newline really is gone and the assertion is not a
 * restatement of the prop.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

/** Mount a field with real state, the way a tab drives it. */
async function mount(props) {
  function Host() {
    const [v, setV] = React.useState(props.value ?? '');
    return React.createElement(TextField, { ...props, value: v, onChange: setV });
  }
  await act(async () => {
    root.render(React.createElement(LocaleProvider, { store: null }, React.createElement(Host)));
  });
  return container.querySelector('textarea, input');
}

/** Type into the field the way a user does: native setter + input event. */
async function type(el, text) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
  await act(async () => {
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('TextField with rows', () => {
  it('should render a textarea when rows is given, so a line break can exist', async () => {
    // The whole defect in one assertion. An input is not merely less pleasant
    // here — it is incapable of holding what the hint asks for.
    const el = await mount({ label: '输入量', value: '', rows: 4 });
    expect(el.tagName).toBe('TEXTAREA');
  });

  it('should keep a newline through the round trip rather than flattening it', async () => {
    // The paste case: a column out of a spreadsheet. On an input the second
    // value is appended to the first and the pair reads as one number.
    const el = await mount({ label: '输入量', value: '', rows: 4 });
    await type(el, '98.2\n97.5');
    expect(el.value).toBe('98.2\n97.5');
    expect(el.value.split('\n')).toHaveLength(2);
  });

  it('should still render a single-line input when rows is not given', async () => {
    // A chemical formula has no lines to hold. Turning every text field into a
    // textarea would be a different regression: a formula box that accepts a
    // newline invites a value no parser can read.
    const el = await mount({ label: '化学式', value: 'NaCl' });
    expect(el.tagName).toBe('INPUT');
    expect(el.getAttribute('type')).toBe('text');
  });

  it('should carry the error and hint wiring onto the textarea', async () => {
    // The textarea branch is a separate element from the one the old code
    // rendered, so every attribute has to be re-checked rather than assumed.
    const el = await mount({ label: '输入量', value: '', rows: 4, error: '读不出来', hint: '每行一个' });
    expect(el.getAttribute('aria-invalid')).toBe('true');
    expect(el.getAttribute('aria-describedby')).toBe('f-输入量-hint');
    expect(container.querySelector('#f-输入量-hint')?.textContent).toBe('读不出来');
  });
});
