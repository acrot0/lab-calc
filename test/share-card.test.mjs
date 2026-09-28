import { describe, it, expect } from 'vitest';
import {
  shareCardSvg, shareCardFilename, wrapText, escapeXml, CARD,
  lowestRowY, footerY, truncateTo, COLUMNS, textWidth, textColumns, columnsOf,
} from '../src/ui/share-card.mjs';

/*
 * The share card is a pure string builder, so almost all of it is testable
 * without a browser. The two things that would break silently are both here:
 * an unescaped character turning the SVG into malformed XML (which renders as
 * nothing at all), and a missing attribution line — the card is the one export
 * that leaves the app with no filename to explain it.
 */

const card = {
  title: '称量配制',
  summary: '配制 0.5 mol/L NaCl 溶液 500 mL',
  value: '14.61',
  unit: 'g',
  rows: [['摩尔质量', '58.44 g/mol'], ['物质的量', '0.25 mol']],
  note: '教育用途',
  software: 'Lab Calc',
  version: '1.0.0',
};

describe('escapeXml', () => {
  it('should escape the five XML metacharacters', () => {
    expect(escapeXml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;');
  });

  it('should leave ordinary text alone', () => {
    expect(escapeXml('0.5 mol/L')).toBe('0.5 mol/L');
  });

  it('should handle a null input', () => {
    expect(escapeXml(null)).toBe('');
  });
});

describe('wrapText', () => {
  it('should keep a short string on one line', () => {
    expect(wrapText('short', 40)).toEqual(['short']);
  });

  it('should break a long string into several lines', () => {
    const lines = wrapText('a'.repeat(95), 40);
    expect(lines.length).toBe(3);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(40);
  });

  it('should not lose any characters when wrapping', () => {
    const s = 'abcdefghijklmnopqrstuvwxyz0123456789';
    expect(wrapText(s, 7).join('')).toBe(s);
  });

  it('should honour an explicit newline', () => {
    expect(wrapText('one\ntwo', 40)).toEqual(['one', 'two']);
  });

  it('should count a CJK character as two columns', () => {
    // A card of Chinese text wraps at half the character count, which is what
    // keeps it inside the panel — the alternative is a line running off the
    // right edge, and there is no way to notice that in a test that only
    // counted characters.
    const lines = wrapText('配'.repeat(30), 40);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('should return nothing for an empty or null string', () => {
    expect(wrapText('', 40)).toEqual([]);
    expect(wrapText(null, 40)).toEqual([]);
    expect(wrapText('   ', 40)).toEqual([]);
  });

  it('should not emit an empty line for a trailing newline', () => {
    expect(wrapText('one\n', 40)).toEqual(['one']);
  });
});

describe('shareCardSvg', () => {
  it('should produce a well-formed SVG document', () => {
    const svg = shareCardSvg(card);
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('should size the canvas to the card', () => {
    const svg = shareCardSvg(card);
    expect(svg).toContain(`width="${CARD.width}"`);
    expect(svg).toContain(`height="${CARD.height}"`);
  });

  it('should show the headline value', () => {
    expect(shareCardSvg(card)).toContain('14.61');
  });

  it('should show the unit', () => {
    expect(shareCardSvg(card)).toContain('>g<');
  });

  it('should show the title and summary', () => {
    const svg = shareCardSvg(card);
    expect(svg).toContain('称量配制');
    expect(svg).toContain('配制 0.5 mol/L NaCl 溶液 500 mL');
  });

  it('should show the secondary rows', () => {
    const svg = shareCardSvg(card);
    expect(svg).toContain('58.44 g/mol');
    expect(svg).toContain('0.25 mol');
  });

  it('should always carry the software attribution', () => {
    // The card is the one export with no filename to explain itself. A number
    // in a chat with no provenance is exactly what this app argues against.
    expect(shareCardSvg(card)).toContain('Lab Calc');
  });

  it('should carry the version when given one', () => {
    expect(shareCardSvg(card)).toContain('Lab Calc 1.0.0');
  });

  it('should carry the attribution even with no version', () => {
    expect(shareCardSvg({ ...card, version: '' })).toContain('Lab Calc');
  });

  it('should carry the attribution even with almost no data', () => {
    expect(shareCardSvg({ value: '1' })).toContain('Lab Calc');
  });

  it('should escape a value that would break the XML', () => {
    const svg = shareCardSvg({ ...card, summary: 'a < b & c > d' });
    expect(svg).toContain('a &lt; b &amp; c &gt; d');
    expect(svg).not.toContain('a < b & c > d');
  });

  it('should escape a title containing quotes', () => {
    const svg = shareCardSvg({ ...card, title: 'the "best" case' });
    expect(svg).toContain('&quot;');
  });

  it('should not emit an empty text element for a missing summary', () => {
    const svg = shareCardSvg({ ...card, summary: '' });
    expect(svg).not.toContain('></text>');
  });

  it('should render in the light theme when asked', () => {
    const dark = shareCardSvg(card);
    const light = shareCardSvg({ ...card, theme: 'light' });
    expect(light).not.toBe(dark);
  });

  it('should default to the dark theme', () => {
    expect(shareCardSvg({ ...card, theme: undefined })).toBe(shareCardSvg({ ...card, theme: 'dark' }));
  });

  it('should survive a null card', () => {
    expect(() => shareCardSvg(null)).not.toThrow();
    expect(shareCardSvg(null)).toContain('<svg');
  });

  it('should cap the number of secondary rows', () => {
    // A tab with twelve outputs would push the rows off the bottom of the card.
    const many = { ...card, rows: Array.from({ length: 12 }, (_, i) => [`k${i}`, `v${i}`]) };
    const svg = shareCardSvg(many);
    expect(svg).toContain('v0');
    expect(svg).not.toContain('v11');
  });

  /*
   * The layout defect that shipped and was caught by looking at a render.
   *
   * The rows were anchored near the bottom and stepped *downward*, so with
   * three or more rows the last value landed on the footer line and the note
   * underneath it disappeared. The markup was valid and every string was
   * present — only the geometry was wrong, so only the geometry catches it.
   */
  it('should keep the lowest row clear of the footer', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(lowestRowY(n), `${n} rows overlap the footer`).toBeLessThan(footerY());
    }
  });

  it('should keep the rows inside the card', () => {
    expect(lowestRowY(4)).toBeGreaterThan(0);
    expect(lowestRowY(4)).toBeLessThan(CARD.height);
  });

  it('should not place the first row above the headline value', () => {
    // The headline sits at 52% of the height; the rows must be below it.
    expect(lowestRowY(4)).toBeGreaterThan(CARD.height * 0.52);
  });

  it('should report no row position when there are no rows', () => {
    expect(lowestRowY(0)).toBeNull();
  });

  it('should render the note inside the footer band', () => {
    const svg = shareCardSvg({ ...card, note: '教育用途，不用于临床' });
    expect(svg).toContain('教育用途，不用于临床');
  });

  /*
   * The second layout defect, also found by measuring rather than by reading.
   *
   * Row values had no width limit at all, and the second column starts 520
   * units along with the panel ending at 1072 — so a 60-character value reached
   * 1688. Real values reach that: `2.055×10³ mol/L`, a long formula, a
   * conditional constant with its units.
   */
  it('should truncate a row value that would run past the panel', () => {
    const long = 'x'.repeat(80);
    const svg = shareCardSvg({ ...card, rows: [['k', long]] });
    expect(svg).not.toContain(long);
    expect(svg).toContain('…');
  });

  it('should truncate a row label too', () => {
    const svg = shareCardSvg({ ...card, rows: [['标'.repeat(40), 'v']] });
    expect(svg).toContain('…');
  });

  it('should truncate a headline value that would run past the panel', () => {
    const svg = shareCardSvg({ ...card, value: '1234567890123456789012345' });
    expect(svg).toContain('…');
  });

  it('should leave a value that fits untouched', () => {
    // A card that truncates something which fits has lost information for
    // nothing, which is the failure in the other direction.
    const svg = shareCardSvg({ ...card, value: '14.61', rows: [['摩尔质量', '58.44 g/mol']] });
    expect(svg).toContain('14.61');
    expect(svg).toContain('58.44 g/mol');
    expect(svg).not.toContain('…');
  });

  it('should produce balanced tags', () => {
    // An unclosed tag renders as nothing at all in a browser, which is the
    // failure this catches — the card would silently be blank.
    const svg = shareCardSvg(card);
    const opens = (svg.match(/<text/g) ?? []).length;
    const closes = (svg.match(/<\/text>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(opens).toBeGreaterThan(0);
  });
});

describe('truncateTo', () => {
  it('should leave a string that fits alone', () => {
    expect(truncateTo('short', 20)).toBe('short');
  });

  it('should mark a string it had to cut', () => {
    expect(truncateTo('a'.repeat(30), 10)).toBe(`${'a'.repeat(10)}…`);
  });

  it('should fit the content inside the budget', () => {
    // The budget bounds the *text*; the ellipsis is appended after it, so a
    // truncated string renders one column wider than the budget. That is the
    // contract the column constants rely on — they each give up a column of
    // slack so the marker itself still lands inside the panel.
    for (const n of [2, 5, 10, 35]) {
      const cut = truncateTo('x'.repeat(100), n);
      expect(cut).toBe(`${'x'.repeat(n)}…`);
      expect(textColumns(cut.slice(0, -1))).toBeLessThanOrEqual(n);
      expect(textColumns(cut)).toBeLessThanOrEqual(n + 1);
    }
  });

  it('should count a CJK character as its rendered width, not two columns', () => {
    /*
     * A Chinese glyph renders at one em; a column is 0.6 em. So it is 1.67
     * columns, not `wrapText`'s flat 2 — and the difference is not academic.
     * Budgets derived under the flat-2 rule come out about a sixth too small
     * for Chinese content, which truncates a card that would have fit.
     */
    expect(textColumns('配')).toBeCloseTo(1 / 0.6, 6);
    // Ten columns therefore hold six glyphs, not five.
    expect(truncateTo('配'.repeat(10), 10)).toBe('配配配配配配…');
  });

  it('should spend the whole budget rather than leave it short', () => {
    // Off-by-one in the other direction costs content on every card: given room
    // for 35 characters it must use all 35, not 34.
    expect(truncateTo('x'.repeat(100), 35)).toBe(`${'x'.repeat(35)}…`);
  });

  it('should return nothing for a non-positive budget', () => {
    expect(truncateTo('abc', 1)).toBe('a…');
    expect(truncateTo('abc', 0)).toBe('');
    expect(truncateTo('abc', -5)).toBe('');
  });

  it('should survive a null input', () => {
    expect(truncateTo(null, 10)).toBe('');
  });
});

/*
 * The layout, asserted against the geometry rather than against the strings.
 *
 * Every one of these was a real overflow found by measuring a render: the first
 * truncation pass used literals copied into the test, so the test and the
 * builder could drift apart and both look right. Now the builder exports the
 * numbers it used and these check the arithmetic on top of them.
 */
describe('share card geometry', () => {
  /** Every `<text>` in a card, with its x and the width it will render. */
  function lines(svg, fontPx) {
    const out = [];
    const re = new RegExp(`<text x="([\\d.]+)"[^>]*font-size="${fontPx}"[^>]*>([^<]*)</text>`, 'g');
    for (const m of svg.matchAll(re)) {
      out.push({ x: Number(m[1]), text: m[2], width: textWidth(m[2]) });
    }
    return out;
  }

  it('should keep the row columns inside the panel', () => {
    // A value has to fit the narrower column, the ellipsis included: the marker
    // is appended after the budget is spent, so the budget has a column of
    // slack built in and the assertion is the real edge.
    for (const j of [0, 1]) {
      const worst = COLUMNS.x[j] + COLUMNS.row * COLUMNS.advance;
      expect(worst, `row column ${j} overflows`).toBeLessThanOrEqual(COLUMNS.right);
    }
  });

  it('should keep a truncated row inside its column, ellipsis included', () => {
    const svg = shareCardSvg({ ...card, rows: [['k'.repeat(90), 'v'.repeat(90)]] });
    for (const line of lines(svg, COLUMNS.rowFontPx)) {
      expect(line.text.endsWith('…'), 'the fixture should have been truncated').toBe(true);
      expect(line.x + line.width, `"${line.text}" overflows`).toBeLessThanOrEqual(COLUMNS.right);
    }
  });

  it('should keep a truncated headline and its unit on one line', () => {
    /*
     * The defect this exists for: the headline was budgeted the full panel
     * width, so a long value and its unit were drawn on top of each other —
     * 1184 rendered against an edge at 1136. Both halves are checked, because
     * truncating only the value would leave the unit past the edge.
     */
    const svg = shareCardSvg({ ...card, value: '9'.repeat(40), unit: 'mol/L' });
    for (const line of lines(svg, COLUMNS.valueFontPx).concat(lines(svg, COLUMNS.unitFontPx))) {
      expect(line.x + line.width, `"${line.text}" overflows`).toBeLessThanOrEqual(COLUMNS.right);
    }
  });

  it('should give the headline more room when no unit shares the line', () => {
    // Reserving unit space unconditionally would cost three characters on every
    // card that has no unit, which is most of them.
    expect(COLUMNS.value).toBeGreaterThan(COLUMNS.valueWithUnit);
  });

  it('should never truncate a headline that fits', () => {
    const svg = shareCardSvg({ ...card, value: '1.47', unit: 'g' });
    expect(svg).toContain('>1.47<');
    expect(svg).not.toContain('…');
  });

  it('should place a CJK value and unit without overlapping', () => {
    // `String.length` counts a CJK character as one where the renderer draws it
    // as two, so a unit placed by `length` lands inside the number it labels.
    // The gap between the two `<text>` elements is what proves the placement
    // used the rendered width.
    const svg = shareCardSvg({ ...card, value: '十四点六一', unit: '克' });
    const value = lines(svg, COLUMNS.valueFontPx)[0];
    const unit = lines(svg, COLUMNS.unitFontPx)[0];
    const drawnWidth = value.text.length * COLUMNS.valueAdvance; // one unit per char, by length
    expect(unit.x).toBeGreaterThanOrEqual(value.x + drawnWidth);
  });
});

describe('shareCardFilename', () => {
  it('should slug the title and stamp the date', () => {
    const name = shareCardFilename({ title: 'Weigh NaCl' }, new Date('2026-09-28T00:00:00Z'));
    expect(name).toBe('lab-calc-weigh-nacl-2026-09-28.png');
  });

  it('should fall back to a generic slug for a CJK-only title', () => {
    // A Chinese title slugs to nothing; the filename must still be a filename.
    const name = shareCardFilename({ title: '称量配制' }, new Date('2026-09-28T00:00:00Z'));
    expect(name).toBe('lab-calc-result-2026-09-28.png');
  });

  it('should always end in .png', () => {
    expect(shareCardFilename({}, new Date('2026-09-28T00:00:00Z'))).toMatch(/\.png$/);
  });

  it('should survive an invalid date', () => {
    expect(shareCardFilename({ title: 'x' }, new Date('nonsense'))).toBe('lab-calc-x.png');
  });

  it('should survive a null card', () => {
    expect(() => shareCardFilename(null)).not.toThrow();
  });
});
