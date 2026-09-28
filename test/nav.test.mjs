import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PRIMARY_TABS, isPrimary, primaryTabs, secondaryTabs } from '../src/ui/nav.mjs';

/*
 * The phone navigation's composition.
 *
 * The rule being guarded is a platform specification rather than a preference:
 * Material 3 and the iOS Human Interface Guidelines both specify 3–5
 * destinations in a bottom bar. Adding a sixth looks harmless in a diff and
 * violates the guideline every mobile platform shares, so the count is asserted
 * here rather than left to review.
 */

/** Stand-in tab entries, shaped like the ones App.jsx builds. */
const TABS = [
  'weigh', 'dilute', 'buffer', 'series', 'ph', 'percent', 'curve', 'reagent',
  'spectro', 'lab', 'colligative', 'bio', 'reaction', 'electro', 'elements', 'convert',
].map((id) => ({ id, icon: () => null }));

describe('phone navigation', () => {
  it('should put between three and five destinations in the bar', () => {
    // Both platform guidelines say 3-5; below three the bar is not worth the
    // space, above five the targets drop under the touch floor.
    expect(PRIMARY_TABS.length).toBeGreaterThanOrEqual(3);
    expect(PRIMARY_TABS.length).toBeLessThanOrEqual(5);
  });

  it('should give every primary id a tab that exists', () => {
    // A renamed tab should leave a shorter bar, not an undefined icon that
    // crashes the render — but it should also fail here, so the rename is
    // noticed rather than silently shrinking the navigation.
    for (const id of PRIMARY_TABS) {
      expect(TABS.some((t) => t.id === id), `${id} is not a tab`).toBe(true);
    }
  });

  it('should resolve the primary tabs in the declared order', () => {
    // The order is a decision — the screens a session moves through — so it
    // must not be re-sorted by the order they happen to appear in TABS.
    expect(primaryTabs(TABS).map((t) => t.id)).toEqual(PRIMARY_TABS);
  });

  it('should cover every tab between the bar and the sheet', () => {
    // No tab may become unreachable: every one is either in the bar or in the
    // more sheet, and none is in both.
    const primary = new Set(primaryTabs(TABS).map((t) => t.id));
    const secondary = new Set(secondaryTabs(TABS).map((t) => t.id));
    for (const { id } of TABS) {
      expect(primary.has(id) || secondary.has(id), `${id} is unreachable`).toBe(true);
      expect(primary.has(id) && secondary.has(id), `${id} is in both`).toBe(false);
    }
    expect(primary.size + secondary.size).toBe(TABS.length);
  });

  it('should keep the sheet in the app’s own tab order', () => {
    // The sheet lists the same destinations as the rail. Re-ordering them here
    // would make the two navigations disagree about where a tab lives.
    const order = TABS.map((t) => t.id);
    const secondary = secondaryTabs(TABS).map((t) => t.id);
    expect(secondary).toEqual(order.filter((id) => !isPrimary(id)));
  });

  it('should not offer a tab in the bar that is also in the sheet', () => {
    for (const id of PRIMARY_TABS) expect(isPrimary(id)).toBe(true);
    expect(isPrimary('convert')).toBe(false);
  });
});

/*
 * The desktop rail's touch targets, read out of the stylesheet.
 *
 * The rail is the only navigation above 940px — the bottom bar is hidden there
 * — so on a touch laptop it is what a thumb has to hit. Measured in the browser
 * before this test existed: the items were 35.27px tall, because `.rail-inner`
 * was `flex: 0 1 auto` and *shrank* to fit twenty destinations rather than
 * scrolling, squashing the items inside it. The `overflow-y: auto` was never
 * reached: there was nothing to scroll, the content had already been compressed.
 *
 * A rendered-size assertion would need a browser and a layout engine. Reading
 * the two declarations that decide it is enough to catch the regression, and it
 * fails on the actual cause rather than on a symptom — 44px is no use if the
 * container is allowed to shrink it again.
 */
describe('rail touch targets', () => {
  const css = readFileSync('src/ui/styles.css', 'utf8');
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    return m ? m[1] : null;
  };

  it('should give a rail item at least the 44px touch floor', () => {
    const body = rule('.rail-item');
    expect(body, '.rail-item rule not found').not.toBeNull();
    const m = /height:\s*(\d+)px/.exec(body);
    expect(m, '.rail-item has no fixed height').not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(44);
  });

  it('should let the rail list scroll rather than shrink', () => {
    // `flex: 1 1 auto` is the line that makes `overflow-y: auto` reachable.
    // Without it the list shrinks and squashes its children instead.
    const body = rule('.rail-inner');
    expect(body, '.rail-inner rule not found').not.toBeNull();
    expect(body).toMatch(/flex:\s*1/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });

  it('should keep the rail items from shrinking once the list scrolls', () => {
    // Belt and braces: a flex item in a column can still be compressed by a
    // smaller parent even when its own height is set.
    const body = rule('.rail-item');
    expect(body).toMatch(/flex-shrink:\s*0/);
  });
});

/*
 * The history header on a phone, read out of the stylesheet.
 *
 * Measured on the shipped build at 390px: `.history-head` is a `nowrap` flex
 * row with 271px for a heading and three action buttons that need about 301.
 * Every child carries the default `flex-shrink: 1`, so rather than overflowing
 * they all shrank — and since the labels wrap by default, the result was not a
 * clipped row but 「计算记录」 stacked as 计算记/录, 「导出」 as 导/出, and a
 * 65px 「全部清除」 broken after 全部清. The heading measured 84px wide and two
 * lines tall; each button 58px tall.
 *
 * Two declarations are needed and neither is sufficient alone: wrapping the
 * header moves the buttons to their own line, and `nowrap` on the labels stops
 * a two-character word from being split once they are there.
 */
describe('phone history header', () => {
  const css = readFileSync('src/ui/styles.css', 'utf8');

  /** The body of the `@media (max-width: 700px)` block that holds the fix. */
  const phoneBlock = () => {
    const start = css.indexOf('@media (max-width: 700px)');
    expect(start, 'no max-width: 700px block').toBeGreaterThanOrEqual(0);
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) return css.slice(start, i);
      }
    }
    return css.slice(start);
  };

  it('should let the header wrap instead of shrinking its children', () => {
    expect(phoneBlock()).toMatch(/\.history-head\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('should keep the heading and the action labels on one line', () => {
    // A two-character label like 导出 has no space to break at, so without
    // this it breaks between the characters rather than overflowing.
    const block = phoneBlock();
    expect(block).toMatch(/\.history-head h2[\s\S]{0,200}?white-space:\s*nowrap/);
    expect(block).toMatch(/\.head-actions[\s\S]{0,200}?white-space:\s*nowrap/);
  });

  it('should not rely on nowrap alone', () => {
    // `nowrap` without the wrap leaves the three buttons on a line that is
    // still too narrow, so they overflow the panel instead of breaking.
    const block = phoneBlock();
    expect(block).toMatch(/flex-wrap:\s*wrap/);
    expect(block).toMatch(/white-space:\s*nowrap/);
  });
});
