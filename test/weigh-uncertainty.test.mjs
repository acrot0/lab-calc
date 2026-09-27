// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import WeighTab from '../src/ui/tabs/WeighTab.jsx';
import { memoryStore } from '../src/ui/history.mjs';
import { molarMassUncertainty } from '../src/calc/uncertainty.mjs';
import { glasswareUncertainty } from '../src/calc/instruments.mjs';

/*
 * The uncertainty budget on the weigh-out tab.
 *
 * The engine (`uncertainty.mjs`) and the tolerance tables (`instruments.mjs`)
 * each have their own tests. What can still be wrong is the join: a budget that
 * reports a number smaller than its own terms, a panel that renders a zero
 * where it means "unknown", or a result that shows an uncertainty computed from
 * different inputs than the value above it.
 *
 * The numbers below are checked by hand in the comments rather than asserted
 * against a snapshot, because a snapshot of a wrong number is still wrong.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/*
 * Roots are tracked and unmounted.
 *
 * Clearing `document.body` does not stop React: an unmounted-by-DOM root keeps
 * its scheduler work queued, and when the panel's lazy `Report` chunk resolves
 * it commits into a window that the test environment has already destroyed.
 * That surfaced in CI as an unhandled `ReferenceError: window is not defined`
 * after all 1931 tests had passed — on Windows the chunk arrives before
 * teardown, which is why it never failed locally.
 */
const roots = [];
function makeRoot(container) {
  const root = createRoot(container);
  roots.push(root);
  return root;
}


let logged;
beforeEach(() => {
  logged = [];
  const original = console.error;
  console.error = (...args) => { logged.push(args.map(String).join(' ')); original(...args); };
});
afterEach(async () => {
  // Unmount inside `act` so the scheduler is idle before the environment goes
  // away, then clear the DOM.
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.innerHTML = '';
});

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = makeRoot(container);
  // The locale is pinned rather than inherited: the assertions match on
  // rendered text, and a test that silently depends on the suite's default
  // language fails the day that default changes.
  const store = memoryStore({ 'lab-calc.locale.v1': 'zh' });
  await act(async () => {
    root.render(React.createElement(LocaleProvider, { store },
      React.createElement(WeighTab, { onRecord: () => {}, restored: null })));
  });
  return container;
}

const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const setField = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const byLabel = (c, re) => [...c.querySelectorAll('label')].find((l) => re.test(l.textContent));
// `byLabel` returns the <label>; the input is its sibling inside `.field`,
// which is the shape `NumField` renders.
const fieldIn = (label) => label?.parentElement?.querySelector('input') ?? null;

describe('WeighTab uncertainty budget', () => {
  it('should not show an uncertainty until asked', async () => {
    const c = await mount();
    expect(c.querySelector('.unc-panel')).not.toBeNull();
    expect(c.querySelector('.unc-body')).toBeNull();
    expect(logged).toEqual([]);
  });

  it('should open the budget and name every source', async () => {
    const c = await mount();
    await click(c.querySelector('.unc-toggle'));
    const body = c.querySelector('.unc-body');
    expect(body).not.toBeNull();
    // The breakdown is the actionable part: which instrument to change.
    const text = body.textContent;
    // The breakdown is the actionable part: which instrument to change.
    expect(text).toMatch(/天平/);
    expect(text).toMatch(/摩尔质量/);
    expect(text).toMatch(/容量瓶/);
  });

  it('should state the relative uncertainty of the result', async () => {
    const c = await mount();
    await click(c.querySelector('.unc-toggle'));
    const rel = c.querySelector('.unc-relative');
    expect(rel).not.toBeNull();
    // 0.5 M NaCl in a 500 mL class A flask on a four-place balance: the molar
    // mass is 0.0171%, the flask 0.0289%, the balance 0.0012% — 0.034%.
    expect(rel.textContent).toMatch(/0\.034%/);
  });

  it('should not report a relative uncertainty below any single term', async () => {
    /*
     * The failure this catches: adding the relative terms instead of combining
     * them in quadrature gives a smaller total than the largest term, which is
     * arithmetically impossible for a sum of squares and would let a user
     * believe the dominant instrument had been fixed.
     */
    const c = await mount();
    await click(c.querySelector('.unc-toggle'));
    const shown = Number(c.querySelector('.unc-relative strong').textContent.replace('%', ''));
    // The flask term alone is 0.10/√3 / 500 = 0.01155%... but the molar mass
    // term is 0.0171%, so the total must exceed that.
    const mm = molarMassUncertainty('NaCl');
    const mmRelative = (mm.unc / mm.molarMass) * 100;
    expect(shown).toBeGreaterThan(mmRelative);
  });

  it('should size the flask term to the flask, not to the volume being made up', async () => {
    /*
     * The flask's contribution is an absolute volume — 0.25/√3 = 0.1443 mL for
     * a 500 mL class A flask, 0.40/√3 = 0.2309 mL for a 1000 mL one — and it is
     * a *relative* error only after dividing by the volume being made up.
     *
     * Asserted on the contribution rather than on the total because the total
     * is dominated by the molar mass here and both cases round to the same
     * displayed percentage. A test that compared the totals would pass on a
     * budget that had not moved at all.
     */
    const c = await mount();
    await click(c.querySelector('.unc-toggle'));
    const flaskRow = () => [...c.querySelectorAll('.unc-contrib > div')]
      .find((d) => /容量瓶|flask/.test(d.textContent)).textContent;
    // 0.25/√3 = 0.1443 mL, one figure (leading digit 1 takes two, so 0.14) —
    // quoted to the place the uncertainty justifies, not to a fixed count.
    expect(flaskRow()).toMatch(/0\.14/);
    await setField(fieldIn(byLabel(c, /容量瓶规格|Flask size/)), '1000');
    // 0.40/√3 = 0.2309 mL, one figure: 0.2.
    expect(flaskRow()).toMatch(/0\.2/);
  });

  it('should shrink the relative total when the flask is matched to the volume', async () => {
    // 0.40 mL on 1000 mL (0.0231%) is tighter than 0.25 mL on 500 mL (0.0289%),
    // so making up the larger volume in the larger flask is genuinely better —
    // which is the real reason a bench keeps several flask sizes.
    const c = await mount();
    await click(c.querySelector('.unc-toggle'));
    const rel = () => Number(c.querySelector('.unc-relative strong').textContent.replace('%', ''));
    const before = rel();
    await setField(fieldIn(byLabel(c, /容量瓶规格|Flask size/)), '1000');
    await setField(fieldIn(byLabel(c, /定容体积|Final volume/)), '1000');
    expect(rel()).toBeLessThan(before);
  });

  it('should grow the total when class B glassware is chosen', async () => {
    const c = await mount();
    await click(c.querySelector('.unc-toggle'));
    const before = Number(c.querySelector('.unc-relative strong').textContent.replace('%', ''));
    const select = c.querySelector('.unc-body select');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'B');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const after = Number(c.querySelector('.unc-relative strong').textContent.replace('%', ''));
    expect(after).toBeGreaterThan(before);
  });

  it('should add a temperature term away from 20 degrees', async () => {
    const c = await mount();
    await click(c.querySelector('.unc-toggle'));
    const flaskBefore = c.querySelector('.unc-contrib').textContent;
    await setField(fieldIn(byLabel(c, /室温|temperature/)), '30');
    const flaskAfter = c.querySelector('.unc-contrib').textContent;
    // The flask's own contribution must grow: at 30 °C the 2.1e-4/K expansion
    // term adds 0.0303 mL of half-width, which is a third of the class A
    // tolerance on its own.
    expect(flaskAfter).not.toBe(flaskBefore);
  });

  it('should follow the concentration input rather than the one it was given', async () => {
    /*
     * The budget is derived from the form, not stored. The failure this catches
     * is a panel that keeps showing the previous calculation's numbers after
     * the inputs change — an uncertainty that belongs to a different value.
     */
    const c = await mount();
    await click(c.querySelector('.unc-toggle'));
    const before = c.querySelector('.unc-relative strong').textContent;
    // A tenfold weaker solution weighs ten times less, so the balance's
    // absolute uncertainty becomes a ten times larger share of it. Comparing
    // the relative figure rather than the text is what makes this assert the
    // physics: the balance's ±0.00017 g does not change, so a text comparison
    // would pass on a budget that had not moved at all.
    await setField(fieldIn(byLabel(c, /目标浓度|Target concentration/)), '0.05');
    const after = c.querySelector('.unc-relative strong').textContent;
    expect(Number(after.replace('%', ''))).toBeGreaterThan(Number(before.replace('%', '')));
  });

  it('should show the budget alongside a result once calculated', async () => {
    const c = await mount();
    await click([...c.querySelectorAll('button.primary')].find((b) => /计算|Calculate/.test(b.textContent)));
    await click(c.querySelector('.unc-toggle'));
    // The headline result and the uncertainty under it must both be present —
    // a reader who stops at the number must not miss the ±.
    expect(c.querySelector('.result-main').textContent).toMatch(/14\.61/);
    const unc = c.querySelector('.result-unc');
    expect(unc).not.toBeNull();
    expect(unc.querySelector('.result-unc-value').textContent).toMatch(/±/);
  });

  it('should report the balance uncertainty the tolerance tables imply', async () => {
    // 14.61 g on a balance reading to 0.1 mg with a 0.2 mg linearity: the
    // readability term is (0.0001/2)/√3 = 2.89e-5 g, the linearity term is
    // (0.0002/√3)·√2 = 1.63e-4 g, and quadrature gives 1.66e-4 g. Rounded to
    // the place that uncertainty occupies: 14.6100 ± 0.0002 g.
    const c = await mount();
    await click([...c.querySelectorAll('button.primary')].find((b) => /计算|Calculate/.test(b.textContent)));
    await click(c.querySelector('.unc-toggle'));
    const expected = 1.6583e-4;
    // The rendered text is "± 0.0002 g" — read the number out of it rather than
    // asserting the string, so a formatting change does not break the physics.
    const shown = Number(c.querySelector('.result-unc-value').textContent.replace(/[^0-9.]/g, ''));
    expect(Math.abs(shown - expected) / expected).toBeLessThan(0.25);
    expect(c.querySelector('.result-unc-value').textContent).toMatch(/±/);
  });

  it('should match the flask term to the standard, not to a rounded claim', async () => {
    // The class A 500 mL flask is ±0.25 mL, so u = 0.1443 mL. A result that
    // reports 0.25 (the tolerance itself) overstates by 73%; 0.125 (a 95%
    // interval) overstates by 41%.
    const c = await mount();
    await click(c.querySelector('.unc-toggle'));
    const shown = c.querySelector('.unc-contrib').textContent;
    const flask = glasswareUncertainty({ kind: 'flask', nominalMl: 500 });
    // The arithmetic is 0.1443 mL; what is rendered is that rounded to the
    // place the uncertainty occupies, which is 0.14.
    expect(flask.unc).toBeCloseTo(0.25 / Math.sqrt(3), 6);
    expect(shown).toMatch(/0\.14/);
  });

  it('should quote the relative figure to the same precision everywhere', async () => {
    /*
     * The headline line under the result and the budget panel's own line are
     * the same quantity. They were rendered at two and three decimals
     * respectively, so the same calculation read "相对 0.03%" under the number
     * and "0.034%" in the panel below it — two different values for one
     * measurement, which is the kind of inconsistency that makes a reader
     * distrust both.
     */
    const c = await mount();
    await click([...c.querySelectorAll('button.primary')].find((b) => /计算|Calculate/.test(b.textContent)));
    await click(c.querySelector('.unc-toggle'));
    const detail = c.querySelector('.result-unc-detail').textContent;
    const panel = c.querySelector('.unc-relative strong').textContent;
    const digits = (s) => (s.match(/[0-9]+\.[0-9]+/) ?? [''])[0];
    expect(digits(detail)).toBe(digits(panel));
  });

  it('should render the uncertainty panel without logging a React error', async () => {
    const c = await mount();
    await click(c.querySelector('.unc-toggle'));
    await click([...c.querySelectorAll('button.primary')].find((b) => /计算|Calculate/.test(b.textContent)));
    expect(logged).toEqual([]);
  });
});

/*
 * The budget panel's colours, measured rather than eyeballed.
 *
 * The panel was written with `--accent` on the headline percentage, which is
 * the obvious choice and fails: 16px/700 is not WCAG large text, so it needs
 * 4.5:1, and the accent is only guaranteed 3:1 (it is documented as a component
 * colour — focus rings, borders). Two light themes came in at 3.95:1 and
 * 3.71:1. The palette guard cannot catch this because it checks the accent at
 * the component floor, which is the correct floor for what it was written for.
 */
describe('uncertainty panel contrast', () => {
  it('should clear 4.5:1 for every text colour it uses, in every theme', async () => {
    const { PALETTE_KEYS, cssVariables, TEXT_SURFACES } = await import('../src/ui/palettes.mjs');
    const { contrastRatio } = await import('../src/ui/palette.mjs');
    const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : null);

    /*
     * The token each element resolves to. `.unc-relative` paints `--surface-2`
     * and its text sits on that, not on the card behind it; the rest sit on the
     * card's own surface.
     */
    const on = {
      '--text-dim': TEXT_SURFACES, // .unc-caveat, .unc-intro, .result-unc-detail
      '--text-mid': TEXT_SURFACES, // .unc-contrib dt
      '--text': TEXT_SURFACES, // .unc-contrib dd, .unc-relative strong
    };
    const failures = [];
    for (const key of PALETTE_KEYS) {
      const vars = cssVariables(key);
      for (const [fg, surfaces] of Object.entries(on)) {
        for (const surface of surfaces) {
          const ratio = contrastRatio(hex(vars[fg]), hex(vars[surface]));
          if (ratio < 4.5) failures.push(`${key} ${fg} on ${surface}: ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

/*
 * The dilution tab's budget.
 *
 * Same engine, different instruments: a pipette delivers the stock and a flask
 * makes up the final volume, so the two enter as a quotient. The cases below
 * are the ones that differ from weighing — there is no balance term at all, and
 * the pipette's relative error is what governs.
 */
describe('DiluteTab uncertainty budget', () => {
  async function mountDilute() {
    const { default: DiluteTab } = await import('../src/ui/tabs/DiluteTab.jsx');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = makeRoot(container);
    await act(async () => {
      root.render(React.createElement(LocaleProvider, { store: memoryStore({ 'lab-calc.locale.v1': 'zh' }) },
        React.createElement(DiluteTab, { onRecord: () => {}, restored: null })));
    });
    return container;
  }

  it('should offer a budget with a pipette and no balance', async () => {
    const c = await mountDilute();
    await click(c.querySelector('.unc-toggle'));
    const body = c.querySelector('.unc-body');
    expect(body.textContent).toMatch(/移液管/);
    // A dilution measures no mass, so a readability field would imply a
    // weighing step that does not exist.
    expect(body.textContent).not.toMatch(/分度值|readability/);
    expect(logged).toEqual([]);
  });

  it('should be governed by the pipette, not the flask', async () => {
    /*
     * A 25 mL class A pipette is ±0.03 mL (0.12% relative) and a 100 mL class A
     * flask is ±0.10 mL (0.10%). Both are in the budget; the point of the
     * assertion is that the pipette term is the larger of the two, because that
     * is what a user has to change to improve the dilution.
     */
    const c = await mountDilute();
    await click(c.querySelector('.unc-toggle'));
    const rows = [...c.querySelectorAll('.unc-contrib > div')].map((d) => d.textContent);
    const pip = rows.find((r) => /移液管/.test(r));
    const flask = rows.find((r) => /容量瓶/.test(r));
    // 0.03/√3 = 0.01732 mL, quoted to two figures (leading digit 1) and so
    // rendered at the ten-thousandth: "± 0.017".
    expect(pip).toMatch(/0\.017/);
    // 0.10/√3 = 0.05774 mL, one figure (leading digit 5): "± 0.06".
    expect(flask).toMatch(/0\.06/);
    // The comparison the panel exists to make: the pipette is the larger term,
    // so it is what a user changes to improve the dilution.
    const pipVal = Number(pip.replace(/[^0-9.]/g, ''));
    const flaskVal = Number(flask.replace(/[^0-9.]/g, ''));
    expect(pipVal).toBeLessThan(flaskVal);
  });

  it('should put the ± under the result once calculated', async () => {
    const c = await mountDilute();
    await click([...c.querySelectorAll('button.primary')].find((b) => /计算/.test(b.textContent)));
    await click(c.querySelector('.unc-toggle'));
    // 1 M stock to 0.1 M in 100 mL is 10 mL of stock.
    expect(c.querySelector('.result-main').textContent).toMatch(/10/);
    const unc = c.querySelector('.result-unc');
    expect(unc).not.toBeNull();
    expect(unc.querySelector('.result-unc-value').textContent).toMatch(/±/);
  });

  it('should follow the target volume rather than the value it was given', async () => {
    const c = await mountDilute();
    await click(c.querySelector('.unc-toggle'));
    const rel = () => Number(c.querySelector('.unc-relative strong').textContent.replace('%', ''));
    const before = rel();
    // Making up 1000 mL instead of 100 mL in a 1000 mL flask (0.40 mL, 0.023%)
    // is tighter than 0.10 mL on 100 mL (0.058%), so the relative total falls.
    await setField(fieldIn(byLabel(c, /容量瓶规格|Flask size/)), '1000');
    await setField(fieldIn(byLabel(c, /目标体积|Target volume/)), '1000');
    expect(rel()).toBeLessThan(before);
  });

  it('should render the panel without logging a React error', async () => {
    const c = await mountDilute();
    await click(c.querySelector('.unc-toggle'));
    await click([...c.querySelectorAll('button.primary')].find((b) => /计算/.test(b.textContent)));
    expect(logged).toEqual([]);
  });
});

describe('the budget panel lists each source once', () => {
  it('should not repeat a source the tab also passes in', async () => {
    /*
     * The panel renders the pipette row itself when the budget carries one, and
     * the dilution tab also passed a pipette `Contribution` as a child — so the
     * row appeared twice, which reads as two separate instruments contributing.
     * A source listed twice is worse than one listed not at all: the reader
     * concludes they own two pipettes.
     */
    const { default: DiluteTab } = await import('../src/ui/tabs/DiluteTab.jsx');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = makeRoot(container);
    await act(async () => {
      root.render(React.createElement(LocaleProvider, { store: memoryStore({ 'lab-calc.locale.v1': 'zh' }) },
        React.createElement(DiluteTab, { onRecord: () => {}, restored: null })));
    });
    await click(container.querySelector('.unc-toggle'));
    const rows = [...container.querySelectorAll('.unc-contrib > div')].map((d) => d.textContent);
    const pipetteRows = rows.filter((r) => /移液管/.test(r));
    expect(pipetteRows).toHaveLength(1);
  });
});
