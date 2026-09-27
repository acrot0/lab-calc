import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * The brand mark has to encode the differentiator, not the topic.
 *
 * The complaint was "没运用好我们的架构优势", and it was the most precise note in
 * the whole review. The old mark was a carefully drawn flask — and a flask is
 * what *any* chemistry app would draw. It said "chemistry", which every
 * competitor also is, rather than what this one does that they do not.
 *
 * What it does is keep every calculation; the README's own contrast is that the
 * others 算完就忘. So the mark's liquid is stratified: each band is one record,
 * dimmer than the one above it, the newest on top. A flask read as a log.
 *
 * These assertions are about the meaning rather than the pixels — they cannot
 * see whether it looks good, but they can see whether the idea is still there,
 * and they fail if someone redraws it back into a plain flask.
 */

const src = readFileSync('src/ui/components/BrandMark.jsx', 'utf8');

describe('brand mark', () => {
  it('should draw the liquid as more than one layer', () => {
    // One band is a liquid level. Several is a record.
    const layers = src.match(/LAYERS = \[([\s\S]*?)\];/);
    expect(layers, 'LAYERS must be declared').not.toBeNull();
    const entries = layers[1].match(/y:/g) ?? [];
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  it('should fade the layers with depth, so they read as time', () => {
    // Equal opacity would be a stripe pattern. A decreasing ramp is what makes
    // the eye read a sequence with a direction.
    const body = src.match(/LAYERS = \[([\s\S]*?)\];/)[1];
    const opacities = [...body.matchAll(/opacity:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    expect(opacities.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < opacities.length; i += 1) {
      expect(opacities[i], 'each layer dimmer than the one above').toBeLessThan(opacities[i - 1]);
    }
  });

  it('should keep the layers inside the glass', () => {
    // A band painted outside the flask is not liquid, it is a stripe on the
    // background.
    expect(src).toContain('clipPath');
    expect(src).toMatch(/clipPath=\{`url\(#\$\{u\}-body\)`\}/);
  });

  it('should draw the top surface as its own straight line', () => {
    // Inside the clip, the surface would take the walls' slant — and a liquid
    // level is the one edge that has to be level.
    expect(src).toContain('M8.9 15.6h14.2');
  });

  it('should still be a flask, not an abstract stack', () => {
    // The layers are meaningless if the silhouette stops reading as a vessel.
    expect(src).toContain('M12.6 4.5h6.8v7.2l8 13.4');
  });

  it('should not carry decoration that says nothing', () => {
    // The bubble was the old mark's only purely decorative element; the layers
    // now supply the detail it was there for.
    expect(src).not.toMatch(/<circle/);
  });

  it('should stay themeable rather than hard-coding a colour', () => {
    // It inherits the palette through custom properties, so one component
    // serves every theme in both schemes.
    expect(src).toContain('var(--accent)');
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
