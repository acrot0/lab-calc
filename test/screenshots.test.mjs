import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { PALETTES } from '../src/ui/palettes.mjs';

/**
 * The store screenshots are generated, and nothing at runtime reads them — a
 * stale one is invisible until someone installs the app and sees a preview of a
 * version that no longer exists. These assertions are the only thing that would
 * notice.
 */

/** Width and height from a PNG's IHDR chunk, without decoding the image. */
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf-8'));
const script = readFileSync('scripts/make-screenshots.mjs', 'utf-8');

describe('store screenshots', () => {
  it('should exist at the sizes the manifest declares', () => {
    // A mismatch makes the browser scale the image, and a scaled screenshot is
    // visibly soft in the install prompt.
    for (const shot of manifest.screenshots) {
      const file = `public/${shot.src.replace(/^\.\//, '')}`;
      expect(existsSync(file), `${file} should exist`).toBe(true);
      const { w, h } = pngSize(readFileSync(file));
      expect(`${w}x${h}`, `${shot.src} declared size`).toBe(shot.sizes);
    }
  });

  it('should take its colours from the app palette rather than a copy', () => {
    /*
     * The whole value of these images is that they look like the product. A
     * hardcoded hex that drifts shows colours the app stopped using, in a file
     * nothing regenerates — so the script must read the tokens, not restate
     * them.
     */
    expect(script).toContain("from '../src/ui/palettes.mjs'");
    expect(script).toContain('PALETTES.dark.tokens');

    // And no literal from the palette may appear as a colour in the script.
    for (const [name, value] of Object.entries(PALETTES.dark.tokens)) {
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) continue;
      expect(script.toLowerCase(), `${name} ${value} should not be hardcoded`)
        .not.toContain(value.toLowerCase());
    }
  });

  it('should ship the mark on a transparent background for store listings', () => {
    // A store tile that wants the mark alone cannot use the icon plate, which
    // has the app's background baked in.
    expect(existsSync('public/store-icon.png')).toBe(true);
    expect(pngSize(readFileSync('public/store-icon.png'))).toEqual({ w: 512, h: 512 });
  });

  it('should be regenerable from the icons script without rewriting icons', () => {
    /*
     * `make-screenshots.mjs` imports `drawIcon` from `make-icons.mjs`. Without
     * the write guard there, that import would rewrite every icon as a side
     * effect — so running the screenshot script would silently touch assets it
     * has no business touching.
     */
    expect(script).toContain("from './make-icons.mjs'");
    const icons = readFileSync('scripts/make-icons.mjs', 'utf-8');
    expect(icons).toContain('import.meta.filename');
  });
});
