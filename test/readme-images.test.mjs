import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/*
 * The README's screenshots must point at files that exist.
 *
 * ## Why this is a test and not a habit
 *
 * A README image is referenced by path and rendered by a host that is not this
 * repo. Nothing in the build reads `docs/images/`, so moving, renaming or
 * deleting one leaves every local check green and shows a broken-image glyph on
 * GitHub — where the reader is a stranger deciding whether to trust the
 * project. That is the worst place for a defect and the easiest one to miss.
 *
 * The same class of mistake bit this repo before with the install table: the
 * README promised four release artifacts and shipped one, and it took a
 * deliberate check to notice. The pattern is that prose about the product is
 * unverified by construction, so each claim that *can* be checked mechanically
 * gets a test.
 */

const README = readFileSync('README.md', 'utf-8');

/** Every `![alt](path)` in the README, with the raw path. */
function imageRefs(text) {
  return [...text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((m) => ({ alt: m[1], path: m[2] }));
}

describe('README images', () => {
  it('should reference at least one screenshot', () => {
    // The complaint this answers: 产品最好的一面没有展现出来. A README for a GUI
    // app that shows no GUI asks the reader to install it on faith.
    expect(imageRefs(README).length).toBeGreaterThan(0);
  });

  it('should point every image at a file that exists', () => {
    const refs = imageRefs(README);
    for (const { path } of refs) {
      // Remote images are somebody else's uptime; only local ones are ours.
      if (/^https?:\/\//.test(path)) continue;
      const file = resolve(dirname('README.md'), path);
      expect(existsSync(file), `${path} (referenced as an image) should exist`).toBe(true);
    }
  });

  it('should give every image alt text, so the README survives a failed load', () => {
    // Alt text is what a screen reader announces and what GitHub shows when the
    // image does not render. An empty one makes the figure invisible to both.
    for (const { alt, path } of imageRefs(README)) {
      expect(alt.trim().length, `${path} should have alt text`).toBeGreaterThan(0);
    }
  });

  it('should describe what each screenshot shows rather than naming the file', () => {
    /*
     * `![screenshot](...)` tells a reader who cannot see the image nothing. The
     * alt text is the only description of the product in the figure, so it has
     * to carry the content — the tab, and the number that proves it works.
     */
    for (const { alt, path } of imageRefs(README)) {
      expect(alt, `${path} alt text should not be the literal "screenshot"`)
        .not.toMatch(/^(screenshot|image|截图|图片)$/i);
    }
  });
});
