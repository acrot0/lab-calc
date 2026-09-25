import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSmiles } from '../src/ui/smiles.mjs';

/*
 * SmilesDrawer draws into a DOM, so the drawing itself is verified in the
 * browser. What is checked here is the part that fails *silently* and so would
 * never be noticed by looking at one theme:
 *
 * - The library paints atom labels with a hardcoded `fill="#ffffff"` and
 *   `class="element"`, and the theme object it accepts does not reach them.
 *   On a light palette that is white on near-white: the heteroatoms vanish
 *   while the bonds re-theme correctly, so the structure looks fine and is
 *   quietly missing its N and O labels. A CSS rule is the fix, and these
 *   assertions hold it in place.
 * - A SMILES string that cannot be parsed must return null rather than throw,
 *   because the caller renders a message and an exception would blank the tab.
 */

describe('parseSmiles', () => {
  it('should parse a simple ring', async () => {
    expect(await parseSmiles('c1ccccc1')).toBeTruthy();
  });

  it('should parse a structure with stereochemistry', async () => {
    // Glucose's SMILES carries @ and @@ markers; a parser that dropped stereo
    // would still return a tree, so this checks the input is accepted at all.
    expect(await parseSmiles('OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O')).toBeTruthy();
  });

  it('should return null for an empty or non-string input', async () => {
    for (const bad of ['', '   ', null, undefined, 42]) {
      expect(await parseSmiles(bad)).toBeNull();
    }
  });

  it('should reject an unclosed ring', async () => {
    /*
     * SmilesDrawer accepts `c1ccccc` and returns a tree. Drawn, that is a
     * *chain* where the user asked for a ring — a wrong structure presented
     * with no indication anything failed, which is worse than an error.
     * `ringDigitsBalanced` catches it before the parser sees it.
     */
    expect(await parseSmiles('c1ccccc')).toBeNull();
    expect(await parseSmiles('C1CC1C1')).toBeNull();
  });

  it('should still accept balanced rings and isotope notation', async () => {
    // The check must not reject a legitimate `[13CH4]`, whose digits are a
    // mass number rather than a ring closure.
    expect(await parseSmiles('c1ccccc1')).toBeTruthy();
    expect(await parseSmiles('C1CC1')).toBeTruthy();
    expect(await parseSmiles('[13CH4]')).toBeTruthy();
  });

  it('should return null rather than throwing on garbage', async () => {
    // The caller shows a message; an exception here would blank the whole tab.
    for (const bad of ['not a molecule!!!', '((((', 'XxXxX']) {
      await expect(parseSmiles(bad), bad).resolves.toBeNull();
    }
  });

  it('should not load the renderer for input it rejects outright', async () => {
    /*
     * The ring-balance check runs before the dynamic import, so a typo does
     * not pull 190 KB over the wire. This is the reason the check is ordered
     * the way it is, and it is easy to undo by moving the import earlier.
     */
    const mod = await import('../src/ui/smiles.mjs');
    await mod.parseSmiles('c1ccccc');
    // The module was already loaded by the tests above, so this asserts the
    // ordering exists in source rather than that the network was spared.
    expect(readFileSync('src/ui/smiles.mjs', 'utf8'))
      .toMatch(/ringDigitsBalanced\(smiles\)[\s\S]*?loadSmilesDrawer\(\)/);
  });
});

describe('atom label theming', () => {
  const css = readFileSync('src/ui/styles.css', 'utf8');

  it('should override the library hardcoded white atom labels', () => {
    // Without this rule the labels are white in every theme, including the
    // light ones where they become invisible.
    const rule = css.match(/\.molecule-svg[^{]*\{[^}]*fill:\s*var\(--text\)[^}]*\}/);
    expect(rule, 'no rule sets .molecule-svg text fill to var(--text)').toBeTruthy();
    expect(rule[0]).toContain('.element');
  });

  it('should not use !important, which would be a sign the cascade is wrong', () => {
    // An author rule already outranks a presentation attribute; needing
    // !important would mean something else is overriding this and the real
    // problem is elsewhere.
    const idx = css.indexOf('.molecule-svg text');
    expect(idx).toBeGreaterThan(-1);
    expect(css.slice(idx, idx + 200)).not.toContain('!important');
  });
});
