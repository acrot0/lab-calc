import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * A container query whose threshold can never be reached.
 *
 * `@container card (min-width: 620px)` guarded four rule groups — the
 * two-column results layout, the flex column, the result spacing and the
 * un-nesting of a result panel. The container is `.work`, and the grid track
 * sizes it to 612px:
 *
 *     .split:not(:has(> .card.is-elements)) {
 *       grid-template-columns: minmax(0, 612px) minmax(320px, 1fr);
 *     }
 *
 * 612 < 620, so the query never matched and every rule inside it was dead.
 * Nothing failed: the layout simply fell back to the block flow, which looks
 * close enough to correct that it went unnoticed through the v1.0.0 release
 * and the v1.1.0 layout work — including the commit that wrote the 612px track
 * and verified the card *width* in a browser without checking whether the
 * query that depended on it still fired.
 *
 * The failure surfaced only when a new rule was added inside that block and
 * had no effect: the empty-state illustration sat in a 158px strip above 255px
 * of unused card.
 *
 * So the two numbers are checked against each other. They are the same fact
 * stated in two places, and a test is what keeps them equal.
 */

const css = readFileSync('src/ui/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The min-width a container query for `card` requires, or null. */
function queryThreshold() {
  const m = css.match(/@container\s+card\s*\(\s*min-width:\s*(\d+)px\s*\)/);
  return m ? Number(m[1]) : null;
}

/**
 * The width the split track gives the working column.
 *
 * Matched loosely on the trailing `:not(...)` clauses: the selector carries one
 * per card type that opts out of the narrow track, and adding a type must not
 * silently stop this guard from finding the rule.
 */
function trackWidth() {
  const m = css.match(/\.split:not\(:has\(>\s*\.card\.is-elements\)\)[^{]*\{[^}]*grid-template-columns:[^;]*?(\d+)px/);
  return m ? Number(m[1]) : null;
}

describe('the card container query', () => {
  it('should find both numbers in the stylesheet', () => {
    // A silent no-match here would make the comparison below vacuous.
    expect(queryThreshold(), 'no @container card query found').not.toBeNull();
    expect(trackWidth(), 'no split track width found').not.toBeNull();
  });

  it('should have a threshold the track can actually reach', () => {
    /*
     * The whole point. A threshold above the track width is a block of dead
     * rules that reads as live code, which is worse than no rules at all:
     * someone will add to it and wonder why nothing happens.
     */
    const threshold = queryThreshold();
    const track = trackWidth();
    expect(
      threshold,
      `容器查询阈值 ${threshold}px 高于轨道宽度 ${track}px，块内规则永不生效`,
    ).toBeLessThanOrEqual(track);
  });

  it('should keep the two-column results layout inside the query', () => {
    // The rule the query exists for. If it moves out, this guard is checking
    // a threshold that no longer guards anything.
    const block = css.slice(css.indexOf('@container card'));
    expect(block).toContain('.card:has(> .card-results)');
  });
});
