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
const css = readFileSync('src/ui/styles.css', 'utf8');

/**
 * Rule bodies for a selector, comments stripped so prose cannot match.
 *
 * Rules nested in an `@media` or `@container` are matched too: the selector
 * is what identifies a rule, and where it is wrapped is not the caller's
 * concern. A plain `[^{}]+\\{` scan finds those, because the at-rule's own
 * prelude is just another run of non-brace characters.
 *
 * At file scope rather than inside one `describe`, because the layout
 * assertions below live in more than one group and each needs it.
 */
function bodies(selector) {
  const sheet = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out = [];
  const re = new RegExp(`(?:^|[};])\\s*${escaped}\\s*\\{([^{}]*)\\}`, 'gm');
  for (const m of sheet.matchAll(re)) out.push(m[1]);
  return out;
}

describe('form card width', () => {
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

describe('the history panel height', () => {
  /*
   * Measured on the shipped build, 1440px wide:
   *
   *   viewport   left column bottom   right column bottom   difference
   *   900px      986.1                888.5                 97.6px
   *   934px      986.1                888.5                 97.6px   ← unchanged
   *
   * The two columns start together (y = 83.3) and end 97.6px apart, and the gap
   * does not move when the viewport does. That is the signature of a constant:
   * `.history-list { max-height: 620px }`.
   *
   * The panel already had the right rule — `.split > .card { max-height:
   * calc(100dvh - var(--s10)) }`, which is viewport-relative and correct. The
   * list's own 620px cap then stopped the panel from ever reaching it: measured
   * panel 805.2px against its own 894px ceiling, with 185.2px of that being the
   * panel's chrome (head, group bar, search, padding).
   *
   * The visible symptom is the scroll edge. A scroll container clips its
   * children mid-card by definition, but a clip with no fade at the boundary
   * reads as a rendering fault rather than as "there is more below" — which is
   * how it was reported.
   *
   * So the list is sized from the panel it lives in, and the scroll edge fades.
   */
  it('should not hard-code the list height', () => {
    // A fixed px cap is the root cause: it cannot follow the viewport, so the
    // two columns can never agree and the clip lands wherever 620px falls.
    const listRules = bodies('.history-list');
    expect(listRules.length, 'no rule for the history list').toBeGreaterThan(0);
    const fixed = listRules.filter((b) => /max-height:\s*\d+px/.test(b));
    expect(fixed, `.history-list 的高度写死成像素：${fixed.join(' / ')}`).toEqual([]);
  });

  it('should size the list from the panel rather than from the viewport', () => {
    /*
     * `max-height: calc(100dvh - Npx)` on the list would be the tempting fix
     * and is wrong: the list does not start at the top of the viewport, it
     * starts below the panel's chrome. Subtracting a constant for that chrome
     * is the same mistake one level down — the chrome height is not constant,
     * because the group bar is absent when there are no groups.
     *
     * Flex lets the panel's own layout report the chrome height, so the list
     * gets whatever is left without anyone guessing at it.
     */
    const listRules = bodies('.history-list');
    const fromPanel = listRules.some((b) => /flex:\s*1/.test(b) || /min-height:\s*0/.test(b));
    expect(fromPanel, 'the list is not sized by the panel it lives in').toBe(true);
  });

  it('should fade the scroll edge, so a clipped card reads as more-below', () => {
    // Without this the cut is hard, and a hard cut looks like a broken render.
    const listRules = bodies('.history-list');
    const fades = listRules.some((b) => /mask-image|mask\s*:/.test(b));
    expect(fades, 'the scroll edge has no fade').toBe(true);
  });

  it('should keep the panel itself viewport-relative', () => {
    // The rule that was already right, and that the list's fixed cap defeated.
    const cardRules = bodies('.split > .card');
    expect(cardRules.length, 'no rule for the sticky panel').toBeGreaterThan(0);
    const viewportRelative = cardRules.some((b) => /(?:max-)?height:\s*calc\(\s*100d?vh/.test(b));
    expect(viewportRelative, 'the panel no longer tracks the viewport').toBe(true);
  });

  it('should give the panel a height, not only a ceiling', () => {
    /*
     * Found by re-measuring after the first fix, which is why it is here.
     *
     * Changing the list from `max-height: 620px` to `flex: 1` fixed the
     * populated case and broke the empty one: measured with 69 records the
     * panel was 894px, and with the history cleared it collapsed to 382.5px
     * against 860px of available space.
     *
     * The reason is that `max-height` is a ceiling, not a size. The panel is
     * `align-self: start` in the grid, so it is content-sized; the old fixed
     * 620px on the list was what had been forcing it open. Remove that and a
     * short panel simply shrinks — and `flex: 1` on the list has nothing to
     * distribute, because the panel never claimed the space.
     *
     * A `height` makes the panel claim it, so both states agree: the list fills
     * what the chrome leaves, and the empty state keeps the panel at full
     * height instead of collapsing to its own text.
     */
    const cardRules = bodies('.split > .card');
    const hasHeight = cardRules.some((b) => /(?:^|[;{\s])height:\s*calc\(\s*100d?vh/.test(b));
    expect(hasHeight, '面板只有上限没有高度，内容一少就塌').toBe(true);
  });
});
