import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * The form card's width, read out of the stylesheet.
 *
 * Measured on the shipped build at 1440×900 and 1920×1080, before this test:
 *
 *   card                849 / 904px
 *   form column         560px        ← capped
 *   right dead space    289 / 319px
 *   化学式 field        327px
 *   the .row below it   560px
 *
 * Three rules produced that, and each is defensible alone:
 *
 *   1. `.field { max-width: max(220px, 34ch) }`  — stops a lone input spanning
 *      the card
 *   2. `.row .field { max-width: none }`         — two fields side by side are
 *      already half-width
 *   3. `@container card (min-width: 620px) { .card-main { max-width: 560px } }`
 *      — stops the primary button becoming a metre-wide bar (measured at
 *      1920px: a 220px input above an 894px button, which reads as two
 *      unrelated layouts stacked)
 *
 * Together they leave the first field at 327px and the row below it at 560px —
 * two widths in one card — and 289px of the card unused.
 *
 * The fix keeps rule 3's intent (a button is a button) by moving the cap from
 * the column to the card: the card narrows to its content instead of the
 * content stretching to the card. Verified in a browser at 612px card /
 * 563px fields / 25px residual (the card's own padding).
 *
 * A rendered-size assertion needs a layout engine. Reading the declarations
 * that decide it is enough to catch a regression, and it fails on the cause
 * rather than on a symptom.
 */
describe('form card width', () => {
  const css = readFileSync('src/ui/styles.css', 'utf8');

  /**
   * Rule bodies for a selector, comments stripped so prose cannot match.
   *
   * Rules nested in an `@media` or `@container` are matched too: the selector
   * is what identifies a rule, and where it is wrapped is not the caller's
   * concern. A plain `[^{}]+\\{` scan finds those, because the at-rule's own
   * prelude is just another run of non-brace characters.
   */
  const bodies = (selector) => {
    const sheet = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const out = [];
    const re = new RegExp(`(?:^|[};])\\s*${escaped}\\s*\\{([^{}]*)\\}`, 'gm');
    for (const m of sheet.matchAll(re)) out.push(m[1]);
    return out;
  };

  it('should fix the card width on the grid track, not on the card', () => {
    /*
     * The width must not be keyed off the card's own contents. Capping the
     * card with `:not(:has(> .card-results))` was tried and measured: the card
     * jumped 612 → 849px when Calculate was pressed, because the selector
     * stopped matching the moment a result appeared.
     *
     * A track width cannot depend on what fills it, so it is stable across the
     * whole cycle. That is the property being guarded here.
     */
    const splitRules = bodies('.split:not(:has(> .card.is-elements))');
    expect(splitRules.length, 'no width rule on the split track').toBeGreaterThan(0);
    const capped = splitRules.some((b) => /grid-template-columns:[^;]*612px/.test(b));
    expect(capped, 'the split track is not sized to the form width').toBe(true);
  });

  it('should not size the card from whether it has results', () => {
    // Any card-width rule mentioning card-results re-introduces the jump.
    const sheet = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    for (const m of sheet.matchAll(re)) {
      const sel = m[1].trim();
      const body = m[2];
      if (!/\.card\b/.test(sel)) continue;
      if (!/max-width|width:/.test(body)) continue;
      if (/card-results/.test(sel) && /:has\(> \.card-results\)/.test(sel)) {
        offenders.push(`${sel} { ${body.trim()} }`);
      }
    }
    expect(offenders, `card width keyed off result presence:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('should not cap the form column itself', () => {
    // The 560px column cap is what left 289px of the card empty.
    const mainRules = bodies('.card:not(:has(> .card-results)):not(.is-elements) > .card-main');
    const stillCapped = mainRules.some((b) => /max-width:\s*\d+px/.test(b));
    expect(stillCapped, 'the form column is still capped, so the card has dead space').toBe(false);
  });

  it('should let a direct field child of the form fill its column', () => {
    // 化学式 was 327px while the .row beneath it was 560px — two widths in one
    // card. A field that is a direct child of the form must not be capped.
    const fieldRules = bodies('.card-main > .field');
    expect(fieldRules.length, 'no rule for a direct field child').toBeGreaterThan(0);
    const uncapped = fieldRules.some((b) => /max-width:\s*none/.test(b));
    expect(uncapped, 'a direct field child is still width-capped').toBe(true);
  });

  it('should keep the periodic table out of the width rule', () => {
    // Its .card-main holds an 18-column grid that needs the whole card; an
    // earlier cap squeezed it to 201px against the 764px it wanted.
    const splitRules = bodies('.split:not(:has(> .card.is-elements))');
    expect(splitRules.length).toBeGreaterThan(0);
    expect(splitRules.some((b) => /grid-template-columns/.test(b))).toBe(true);
  });
});
