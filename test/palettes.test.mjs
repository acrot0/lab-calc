import { describe, it, expect } from 'vitest';
import {
  PALETTES, PALETTE_KEYS, paletteOf, cssVariables, TEXT_SURFACES,
} from '../src/ui/palettes.mjs';
import { contrastRatio } from '../src/ui/palette.mjs';

/*
 * The themes are editor themes. An editor renders 13px monospace on one flat
 * background and tunes for that; this app renders body text on three surface
 * levels, at sizes down to 11.5px, and needs 4.5:1 on the lightest of them.
 *
 * So "it looks fine in the editor" is not evidence, and neither is "it is an
 * official palette". These tests are the evidence. Every theme that failed
 * when first measured had its failing token darkened, and those deviations are
 * marked in palettes.mjs with the measurement that forced them.
 */

/** Pull the hex out of a token that may be a plain hex. */
const asHex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : null);

/** Every pairing this app actually renders, as [foreground, background] tokens. */
function textPairings(vars) {
  const pairs = [];
  for (const surface of TEXT_SURFACES) {
    // The body ramp. --text-dim is used at 11.5px, where there is no
    // large-text exemption, so it gets the full 4.5:1 rather than 3:1.
    pairs.push(['--text', surface], ['--text-mid', surface], ['--text-dim', surface]);
    // Status colours are text too: a warning is a sentence, not a border.
    pairs.push(['--warn-ink', surface], ['--err-ink', surface]);
  }
  return pairs;
}

describe('palette registry', () => {
  it('should expose a palette for every key', () => {
    for (const key of PALETTE_KEYS) {
      expect(PALETTES[key], key).toBeTruthy();
      expect(PALETTES[key].label.zh, key).toBeTruthy();
      expect(PALETTES[key].label.en, key).toBeTruthy();
      expect(['dark', 'light']).toContain(PALETTES[key].scheme);
    }
  });

  it('should keep dark and light as the first two, so the default pair never moves', () => {
    // These are what a returning user already has stored, and what the OS
    // preference resolves to. Reordering them would silently change the
    // appearance of every existing install.
    expect(PALETTE_KEYS[0]).toBe('dark');
    expect(PALETTE_KEYS[1]).toBe('light');
  });

  it('should fall back to dark for an unknown key rather than throwing', () => {
    // A stored theme key from a future version, or a typo in a URL, must not
    // leave the app with no colours at all.
    expect(paletteOf('nonexistent')).toBe(PALETTES.dark);
  });

  it('should give every palette the same set of custom properties', () => {
    // A theme missing a token inherits the previous theme's value, which looks
    // like a rendering bug rather than a missing colour.
    const reference = Object.keys(cssVariables('dark')).sort();
    for (const key of PALETTE_KEYS) {
      expect(Object.keys(cssVariables(key)).sort(), key).toEqual(reference);
    }
  });
});

describe('contrast', () => {
  it('should clear 4.5:1 for every text pairing on every surface of every theme', () => {
    const failures = [];
    for (const key of PALETTE_KEYS) {
      const vars = cssVariables(key);
      for (const [fg, bg] of textPairings(vars)) {
        const f = asHex(vars[fg]);
        const b = asHex(vars[bg]);
        // A non-hex token here means a gradient or rgba slipped into a text
        // slot; the ratio is not computable, which is itself a defect.
        expect(f, `${key}: ${fg} is not a plain hex (${vars[fg]})`).toBeTruthy();
        expect(b, `${key}: ${bg} is not a plain hex (${vars[bg]})`).toBeTruthy();
        const ratio = contrastRatio(f, b);
        if (ratio < 4.5) {
          failures.push(`${key} ${fg} on ${bg}: ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('should clear 3:1 for the accent against the surface it sits on', () => {
    // The accent carries focus rings, active tabs and link text. 3:1 is the
    // floor for a non-text UI component, and the accent is also used as text.
    const failures = [];
    for (const key of PALETTE_KEYS) {
      const vars = cssVariables(key);
      for (const surface of TEXT_SURFACES) {
        const ratio = contrastRatio(asHex(vars['--accent']), asHex(vars[surface]));
        if (ratio < 3) failures.push(`${key} accent on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('should keep the accent readable as a button label', () => {
    // --accent-ink is the text drawn on a filled accent button, so it needs
    // the full 4.5:1 against --accent, not the 3:1 component floor.
    const failures = [];
    for (const key of PALETTE_KEYS) {
      const vars = cssVariables(key);
      const ratio = contrastRatio(asHex(vars['--accent-ink']), asHex(vars['--accent']));
      if (ratio < 4.5) failures.push(`${key}: ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  it('should distinguish the three surface levels from one another', () => {
    // Nested panels read as nested by their background alone. If two levels
    // are identical the hierarchy disappears, and if they are too close it
    // looks like a rendering artefact.
    const failures = [];
    for (const key of PALETTE_KEYS) {
      const vars = cssVariables(key);
      const s1 = asHex(vars['--surface']);
      const s2 = asHex(vars['--surface-2']);
      const s3 = asHex(vars['--surface-3']);
      if (s1 === s2) failures.push(`${key}: surface and surface-2 are identical`);
      if (s2 === s3) failures.push(`${key}: surface-2 and surface-3 are identical`);
    }
    expect(failures).toEqual([]);
  });
});

describe('provenance', () => {
  it('should credit the upstream theme wherever one was used', () => {
    // A theme shipped under someone else's name is their work; the credit is
    // both a licence courtesy and the thing that lets a reader check the
    // colours against the source.
    for (const key of PALETTE_KEYS) {
      const p = PALETTES[key];
      const borrowed = key.includes('catppuccin') || key.includes('rose-pine');
      if (borrowed) {
        expect(p.credit, key).toBeTruthy();
        expect(p.credit, key).toMatch(/MIT/);
      }
    }
  });

  it('should not ship Nord', () => {
    /*
     * Nord's npm package is `(Apache-2.0 AND CC-BY-SA-4.0)`. Share-alike would
     * attach itself to this MIT distribution, so it is refused — this test
     * exists so a future contributor who likes the palette finds the reason
     * rather than adding it.
     */
    expect(PALETTE_KEYS).not.toContain('nord');
    expect(PALETTE_KEYS.some((k) => k.includes('nord'))).toBe(false);
  });
});

describe('cssVariables', () => {
  it('should emit a value for every token, none empty', () => {
    for (const key of PALETTE_KEYS) {
      for (const [name, value] of Object.entries(cssVariables(key))) {
        expect(value, `${key} ${name}`).toBeTruthy();
      }
    }
  });

  it('should build the soft and line variants from the accent, not hardcode them', () => {
    // A theme whose --accent-soft did not follow --accent would show a blue
    // focus glow on a green theme.
    for (const key of PALETTE_KEYS) {
      const vars = cssVariables(key);
      const accentRgb = asHex(vars['--accent']).replace('#', '');
      const r = parseInt(accentRgb.slice(0, 2), 16);
      expect(vars['--accent-soft'], key).toContain(`rgba(${r},`);
      expect(vars['--accent-line'], key).toContain(`rgba(${r},`);
    }
  });

  it('should pick shadows that match the scheme', () => {
    // A dark theme with a light theme's soft grey shadow loses the depth
    // entirely, because there is nothing darker than the surface to cast onto.
    for (const key of PALETTE_KEYS) {
      const vars = cssVariables(key);
      const dark = PALETTES[key].scheme === 'dark';
      expect(vars['--shadow-2'].includes('rgba(0, 0, 0'), key).toBe(dark);
    }
  });
});
