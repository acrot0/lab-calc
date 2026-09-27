import { describe, it, expect } from 'vitest';
import {
  shareCardSvg, shareCardFilename, wrapText, escapeXml, CARD,
  lowestRowY, footerY,
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
