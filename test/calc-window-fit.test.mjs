import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

/*
 * The calculator window opens with the whole keypad visible.
 *
 * This is a regression guard on a number, which is usually a bad test. It earns
 * its place because the number is a *contract between two files*: the keypad's
 * rendered height lives in the key tables (nine rows of keys at
 * `min-height: 40px`) and the cap lives in the CSS `max-height`. Neither file
 * knows about the other, so a tenth row added to the keypad would silently push
 * the `=` key behind a scrollbar — the window would still open, still work, and
 * still be wrong.
 *
 * The arithmetic below mirrors the real layout: 9 key rows, plus the readout,
 * the fill button, the unit chips and the page switch, plus the body's padding
 * and gaps. Viewport height is not modelled; `100dvh` is the other term in the
 * `min()` and is not what this is about.
 */
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function read(rel) {
  return fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/** The `Npx` value of a custom property in `:root`, as a number. */
function spaceScale(css) {
  const scale = {};
  for (const m of css.matchAll(/--s(\d):\s*calc\((\d+)px/g)) scale[`--s${m[1]}`] = Number(m[2]);
  return scale;
}

describe('calculator window fit', () => {
  const css = read('src/ui/styles.css');

  it('should count nine key rows on each function page', async () => {
    // Four function rows, one memory row and four digit rows — the same on both
    // pages, which is the point of keeping the memory and digit blocks out of
    // the swap. Read from the tables rather than from the source text, so a row
    // added to either page is counted wherever it was declared.
    const { DIGIT_KEYS, FN_PAGES, MEMORY_KEYS } = await import(
      '../src/ui/components/calculator-keys.mjs'
    );
    for (const page of FN_PAGES) expect(page).toHaveLength(4);
    expect(MEMORY_KEYS).toHaveLength(1);
    expect(DIGIT_KEYS).toHaveLength(5);
    expect(FN_PAGES[0].length + MEMORY_KEYS.length + DIGIT_KEYS.length).toBe(10);
  });

  it('should cap the window above the height the keypad needs', () => {
    const s = spaceScale(css);
    expect(s['--s1']).toBe(4);
    expect(s['--s2']).toBe(8);
    expect(s['--s4']).toBe(16);
    expect(s['--s5']).toBe(20);

    const keyMin = Number(/\.calc-key \{[^}]*min-height:\s*(\d+)px/s.exec(css)[1]);
    const keyGap = Number(/\.calc-keypad \{[^}]*gap:\s*(\d+)px/s.exec(css)[1]);
    const rows = 9;
    // The body's own children: readout (48), fill button (36), unit chips (32),
    // page switch (30) — see the rules for each.
    const others = 48 + 36 + 32 + 30;
    const gaps = 4 * s['--s4']; // four gaps between the five body children
    const rowGaps = 8 * keyGap; // eight gaps between the nine key rows
    const pad = 2 * s['--s5'];
    const head = 56; // .calc-head: padding + a control-sized row

    const needed = head + pad + others + gaps + rows * keyMin + rowGaps;
    const cap = Number(/\.calc-drawer \{[^}]*max-height:\s*min\((\d+)px/s.exec(css)[1]);
    expect(cap).toBeGreaterThan(needed - 1);
    // And not absurdly slack: the window should still look like a window.
    expect(cap - needed).toBeLessThan(200);
  });

  it('should leave headroom for the density setting to grow the spacing', async () => {
    /*
     * `--density-space` scales every `--sN`, and the spacious setting is 1.18.
     * The cap has to hold at that factor too, not just at the default.
     *
     * The keypad is deliberately not part of this: its gap is a fixed 8px and
     * its keys a fixed 40px, because an instrument is sized by a fingertip
     * rather than by a type scale. See the note on `.calc-keypad`.
     */
    const { DENSITY_SCALE } = await import('../src/ui/density.mjs');
    const s = spaceScale(css);
    const worst = Math.max(...Object.values(DENSITY_SCALE).map((d) => d.space));
    const g = (n) => n * worst;
    const keyGap = Number(/\.calc-keypad \{[^}]*gap:\s*(\d+)px/s.exec(css)[1]);
    const needed = 56
      + 2 * g(s['--s5'])
      + (48 + 36 + 32 + 30) * worst
      + 4 * g(s['--s4'])
      + 9 * 40
      + 8 * keyGap;
    const cap = Number(/\.calc-drawer \{[^}]*max-height:\s*min\((\d+)px/s.exec(css)[1]);
    expect(worst).toBeGreaterThan(1);
    expect(needed).toBeLessThan(cap);
  });
});
