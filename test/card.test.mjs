import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Card from '../src/ui/components/Card.jsx';
import { Result } from '../src/ui/components/Fields.jsx';

/**
 * `Card` splits a tab into a form column and a results column.
 *
 * The bug this guards against has now been introduced twice: the card splitting
 * into two columns when there is nothing to put in the second one. First as a
 * container query that fired on every tab, then again when the partition moved
 * into this component and rendered an empty results column. Both times the
 * symptom was "the card is half empty", and both times it was reported by the
 * user rather than caught here.
 *
 * A `Result` with no value renders nothing — it returns null — so the markup
 * alone cannot be inspected for this. These tests render the real component and
 * assert on what actually comes out.
 */

/** Render a Card and return its markup. */
const render = (children) => renderToStaticMarkup(
  React.createElement(Card, null, children),
);

/** A Result with no value, which is what a tab has before its calculation runs. */
const emptyResult = () => React.createElement(Result, { value: null });
/** A Result with a value, which is what a tab has after. */
const filledResult = () => React.createElement(Result, { value: '14.61', unit: 'g' });

describe('Card', () => {
  it('should not split when a result has no value', () => {
    /*
     * The regression. Ten of the fifteen tabs render their `Result` elements
     * unconditionally and rely on a null value to hide them; rendering the
     * column for those produced a permanently empty right half.
     */
    const html = render([
      React.createElement('div', { key: 'f', className: 'field' }, 'form'),
      React.createElement('div', { key: 'r' }, emptyResult()),
    ]);
    expect(html).not.toContain('card-results');
    expect(html).toContain('card-main');
  });

  it('should split when a result has a value', () => {
    const html = render([
      React.createElement('div', { key: 'f', className: 'field' }, 'form'),
      React.createElement('div', { key: 'r' }, filledResult()),
    ]);
    expect(html).toContain('card-results');
    expect(html).toContain('14.61');
  });

  it('should split when only one of several results has a value', () => {
    // The common shape: a tab with three results, one per mode, of which only
    // the active mode's is non-null.
    const html = render([
      React.createElement('div', { key: 'f', className: 'field' }, 'form'),
      React.createElement('div', { key: 'a' }, emptyResult()),
      React.createElement('div', { key: 'b' }, filledResult()),
      React.createElement('div', { key: 'c' }, emptyResult()),
    ]);
    expect(html).toContain('card-results');
  });

  it('should treat a zero value as a value', () => {
    // 0 is falsy and is a perfectly good answer — a dilution that takes no
    // stock, a rate that did not change. Testing for truthiness rather than
    // null would hide the column for it.
    const html = render([
      React.createElement('div', { key: 'f' }, 'form'),
      React.createElement('div', { key: 'r' }, React.createElement(Result, { value: 0, unit: 'g' })),
    ]);
    expect(html).toContain('card-results');
  });

  it('should agree with Result about what counts as no value', () => {
    /*
     * `Result` hides only on null and undefined — an empty string renders as an
     * empty result panel, which is what a tab asking for one gets. `Card`'s
     * check is deliberately the same two comparisons, so the column opens
     * exactly when `Result` draws something. A truthiness test here would
     * disagree with `Result` for both `0` and `''`.
     */
    const emptyString = render([
      React.createElement('div', { key: 'f' }, 'form'),
      React.createElement('div', { key: 'r' }, React.createElement(Result, { value: '' })),
    ]);
    expect(emptyString).toContain('card-results');

    const undefinedValue = render([
      React.createElement('div', { key: 'f' }, 'form'),
      React.createElement('div', { key: 'r' }, React.createElement(Result, {})),
    ]);
    expect(undefinedValue).not.toContain('card-results');
  });

  it('should find results inside a fragment', () => {
    /*
     * Three tabs wrap their body in a fragment and switch on a mode. Without
     * flattening, the whole body arrives as one child — the fragment — and
     * every result lands in the form column.
     */
    const html = render([
      React.createElement('div', { key: 'f' }, 'form'),
      React.createElement(React.Fragment, { key: 'g' }, filledResult()),
    ]);
    expect(html).toContain('card-results');
  });

  it('should find a result nested in a conditional', () => {
    // `{cond && <Result/>}` yields the element directly, so it is a child like
    // any other. This is the shape most tabs actually use.
    const html = render([
      React.createElement('div', { key: 'f' }, 'form'),
      React.createElement(React.Fragment, { key: 'c' }, true && filledResult()),
    ]);
    expect(html).toContain('card-results');
  });

  it('should keep every non-result child in the form column', () => {
    const html = render([
      React.createElement('div', { key: 'a', className: 'field' }, 'alpha'),
      React.createElement('div', { key: 'r' }, filledResult()),
      React.createElement('button', { key: 'b', className: 'primary' }, 'beta'),
    ]);
    // The button comes after the result in source order and must still be in
    // the form column, not the results one.
    const main = html.slice(html.indexOf('card-main'), html.indexOf('card-results'));
    expect(main).toContain('alpha');
    expect(main).toContain('beta');
  });

  it('should pass a class through, including is-elements', () => {
    // The periodic table tab opts out of the split by class.
    const html = renderToStaticMarkup(
      React.createElement(Card, { className: 'is-elements' },
        React.createElement('div', null, 'x')),
    );
    expect(html).toContain('card is-elements');
  });
});
