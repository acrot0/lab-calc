import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * The display face, pinned to what it can actually render.
 *
 * `--font-display` was Instrument Serif — a Latin-only serif chosen for the
 * wordmark. It renders exactly one string in this app: `Lab Calc`. The other
 * two rules that asked for it set Chinese (`全部功能`, `计算器`), and Instrument
 * Serif has no CJK glyphs, so those headings have been falling through to
 * `Songti SC` / `SimSun` — a different typeface from the one the CSS names, on
 * every machine, since the day those rules were written.
 *
 * So the defect is not "the font is unfashionable". It is that the stylesheet
 * declares a face for three headings and one of them gets a face nobody chose.
 * The fix is to name a face that has the glyphs: Geist, which is already
 * loaded for the interface, at a heavier weight for the two places that need
 * emphasis. No new bytes.
 *
 * These assertions read the stylesheet, so they hold for the rules that exist
 * rather than for a list copied here.
 */

const css = readFileSync('src/ui/styles.css', 'utf8');
const mainJsx = readFileSync('src/ui/main.jsx', 'utf8');

/** Every declaration of the display font, with the rule it sits in. */
function displayFontRules() {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const [, selector, body] = m;
    const decl = /font-family:\s*var\(--font-display\)/.exec(body);
    if (decl) out.push({ selector: selector.trim().split('\n').pop().trim(), body });
  }
  return out;
}

describe('display font', () => {
  it('should name a face that has the glyphs it is asked to render', () => {
    // Geist ships a full Latin set and is already imported for the interface;
    // the system CJK stack behind it is the same one the body text uses, so
    // the headings and the labels finally come from one family.
    const stack = /--font-display:\s*([^;]+);/.exec(css)[1];
    expect(stack).toContain('Geist');
    expect(stack).not.toContain('Instrument Serif');
  });

  it('should not ask for a weight the face does not have', () => {
    // The old rule asked for 400 and explained why: Instrument Serif has one
    // weight, and a synthesised bold of a high-contrast serif looks like a
    // rendering fault. Geist is a variable face with a real 600, so the
    // emphasis is now available rather than simulated.
    const rules = displayFontRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      const weight = /font-weight:\s*(\d+)/.exec(r.body);
      if (weight) expect(Number(weight[1])).toBeGreaterThanOrEqual(600);
    }
  });

  it('should keep the CJK tail on the display stack', () => {
    // The Chinese headings fall through to these. Dropping them would trade
    // one unintended face for another.
    const stack = /--font-display:\s*([^;]+);/.exec(css)[1];
    expect(stack).toMatch(/Microsoft YaHei|PingFang SC/);
  });

  it('should stop loading a face that is no longer referenced', () => {
    // A font that is imported but unused is invisible in review and permanent
    // in the bundle — the same fault the Space Grotesk import had.
    expect(mainJsx).not.toContain('instrument-serif');
  });

  it('should keep the numeric face tabular, which is why it is separate', () => {
    const stack = /--font-num:\s*([^;]+);/.exec(css)[1];
    expect(stack).toContain('JetBrains Mono');
  });
});
