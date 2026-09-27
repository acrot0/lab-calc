import { describe, it, expect } from 'vitest';
import {
  CUSTOM_KEY, OVERRIDE_KEYS, RADIUS_STEPS, DENSITY_STEPS, MOTION_STEPS,
  emptyOverrides, loadOverrides, saveOverrides, migrateOverrides,
  withOverride, clearOverride, overrideCount, isCustomised,
  overridesToJson, overridesFromJson, describeOverrides, resolveOverrides,
} from '../src/ui/custom-theme.mjs';
import { PALETTE_KEYS, cssVariables } from '../src/ui/palettes.mjs';
import { memoryStore } from '../src/ui/history.mjs';

/*
 * User overrides on top of a palette.
 *
 * The complaint this answers: "主题很多但同汤不同碗，没有自定义空间". Eleven
 * palettes are eleven colours — a user who wants the accent from one, sharper
 * corners, and less motion has no way to say so, and the only way to get it is
 * to fork the project.
 *
 * ## Why overrides and not a full theme editor
 *
 * An override is applied *on top of* a palette, so every palette keeps working
 * and a user who customises nothing sees exactly what they saw before. The
 * alternative — a custom theme that replaces the palette — would have to
 * re-specify every token, and the first missing one renders as an unstyled
 * element. The plan puts the editor UI in P2; this is the model it will drive.
 *
 * ## Why a fixed key list
 *
 * `--surface-2` and `--text-dim` are load-bearing for contrast, and the palette
 * tests check every pairing. A user able to set any token could produce
 * unreadable text, and there would be nothing to check it against. The exposed
 * set is the one where any value is legible: an accent (checked against the
 * surfaces it is used on), corner radius, density, motion.
 */

const store = (initial = {}) => memoryStore(initial);

describe('the override set', () => {
  it('should start empty', () => {
    expect(emptyOverrides()).toEqual({});
    expect(isCustomised(emptyOverrides())).toBe(false);
  });

  it('should expose only keys whose every value stays legible', () => {
    // `--text`, `--surface-*` and `--border*` are deliberately absent: the
    // palette guard checks their contrast pairings, and a user-set value has
    // nothing to check against.
    for (const bad of ['--text', '--text-dim', '--surface', '--surface-2', '--border']) {
      expect(OVERRIDE_KEYS).not.toContain(bad);
    }
    // And the accent is present, because it is checked against the surfaces.
    expect(OVERRIDE_KEYS).toContain('--accent');
  });

  it('should offer named steps rather than free numbers', () => {
    // A slider for corner radius lets a user pick 7px, which looks like a
    // mistake. Named steps are the choices a designer would actually offer.
    expect(RADIUS_STEPS.map((s) => s.id)).toEqual(['sharp', 'default', 'round']);
    expect(DENSITY_STEPS.map((s) => s.id)).toEqual(['compact', 'default', 'spacious']);
    expect(MOTION_STEPS.map((s) => s.id)).toEqual(['reduced', 'default', 'expressive']);
  });
});

describe('withOverride and clearOverride', () => {
  it('should set and clear one key', () => {
    const a = withOverride({}, '--accent', '#ff0000');
    expect(a['--accent']).toBe('#ff0000');
    expect(clearOverride(a, '--accent')).toEqual({});
  });

  it('should refuse an unexposed key', () => {
    // Silently accepting it would put a value into the DOM that nothing
    // validates — and one of those is `--text`.
    expect(withOverride({}, '--text', '#000')).toEqual({});
    expect(withOverride({}, 'not-a-token', 'x')).toEqual({});
  });

  it('should refuse an invalid colour', () => {
    expect(withOverride({}, '--accent', 'red; background: url(x)')).toEqual({});
    expect(withOverride({}, '--accent', 'javascript:alert(1)')).toEqual({});
    expect(withOverride({}, '--accent', '')).toEqual({});
  });

  it('should accept the colour forms a colour input produces', () => {
    for (const c of ['#fff', '#ffffff', '#FFFFFFFF', 'rgb(255, 0, 0)', 'rgba(1,2,3,0.5)', 'hsl(200 50% 50%)']) {
      expect(withOverride({}, '--accent', c)['--accent'], c).toBeTruthy();
    }
  });

  it('should refuse an unknown step id', () => {
    expect(withOverride({}, '--radius', 'enormous')).toEqual({});
    expect(withOverride({}, '--density', 'huge')).toEqual({});
  });

  it('should accept a known step id', () => {
    expect(withOverride({}, '--radius', 'sharp')['--radius']).toBe('sharp');
    expect(withOverride({}, '--density', 'compact')['--density']).toBe('compact');
    expect(withOverride({}, '--motion', 'reduced')['--motion']).toBe('reduced');
  });

  it('should not mutate the input', () => {
    const base = { '--accent': '#fff' };
    withOverride(base, '--radius', 'sharp');
    clearOverride(base, '--accent');
    expect(base).toEqual({ '--accent': '#fff' });
  });

  it('should count what is set', () => {
    let o = {};
    expect(overrideCount(o)).toBe(0);
    o = withOverride(o, '--accent', '#fff');
    o = withOverride(o, '--radius', 'sharp');
    expect(overrideCount(o)).toBe(2);
  });
});

describe('storage', () => {
  it('should round-trip', () => {
    const s = store();
    const o = withOverride(withOverride({}, '--accent', '#123456'), '--radius', 'round');
    expect(saveOverrides(s, o)).toBe(true);
    expect(loadOverrides(s)).toEqual(o);
  });

  it('should read a corrupt value as no overrides', () => {
    // Falling back to the palette is the only safe answer: a half-parsed
    // override set could leave the app with an accent and no radius.
    for (const bad of ['not json', '[]', '"x"', '42', 'null']) {
      expect(loadOverrides(store({ [CUSTOM_KEY]: bad }))).toEqual({});
    }
  });

  it('should drop an invalid key from a hand-edited file', () => {
    const s = store({ [CUSTOM_KEY]: JSON.stringify({ '--text': '#000', '--accent': '#fff' }) });
    const out = loadOverrides(s);
    expect(out['--accent']).toBe('#fff');
    expect(out['--text']).toBeUndefined();
  });

  it('should survive a store that refuses to write', () => {
    const s = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(saveOverrides(s, { '--accent': '#fff' })).toBe(false);
  });
});

describe('resolveOverrides', () => {
  it('should turn an accent override into the derived accent tokens', () => {
    /*
     * A user sets one colour. The palette derives `--accent-hover`,
     * `--brand-deep`, `--accent-soft`, `--accent-line` and `--accent-ink` from
     * its own accent, so an override that set only `--accent` would leave the
     * gradient and the hover states on the old hue — the button would change
     * colour and its hover would not.
     */
    const vars = resolveOverrides({ '--accent': '#ff0000' }, 'dark');
    expect(vars['--accent']).toBe('#ff0000');
    expect(vars['--accent-hover']).toBeTruthy();
    expect(vars['--accent-hover-solid']).toBeTruthy();
    expect(vars['--brand-deep']).toBeTruthy();
    expect(vars['--accent-soft']).toBeTruthy();
    expect(vars['--accent-line']).toBeTruthy();
    /*
     * `--accent-ink` is deliberately NOT derived. It is the text drawn on a
     * filled accent button, and the palettes pick it as a fixed light or dark
     * value rather than computing it. Keeping the palette's is what makes a
     * pale accent still get dark ink; deriving it from the accent would need a
     * luminance test, and getting that wrong gives white-on-yellow.
     */
    expect(vars['--accent-ink']).toBeUndefined();
  });

  it('should not derive accent tokens when the accent is untouched', () => {
    const vars = resolveOverrides({ '--radius': 'sharp' }, 'dark');
    expect(vars['--accent']).toBeUndefined();
  });

  it('should map the radius step to the three radius tokens', () => {
    const vars = resolveOverrides({ '--radius': 'sharp' }, 'dark');
    expect(vars['--r-sm']).toBeTruthy();
    expect(vars['--r-md']).toBeTruthy();
    expect(vars['--r-lg']).toBeTruthy();
  });

  it('should make sharp smaller than round', () => {
    const sharp = resolveOverrides({ '--radius': 'sharp' }, 'dark');
    const round = resolveOverrides({ '--radius': 'round' }, 'dark');
    expect(parseFloat(sharp['--r-md'])).toBeLessThan(parseFloat(round['--r-md']));
  });

  it('should map density to the spacing and type scales', () => {
    const compact = resolveOverrides({ '--density': 'compact' }, 'dark');
    const spacious = resolveOverrides({ '--density': 'spacious' }, 'dark');
    expect(compact['--s3']).toBeTruthy();
    expect(compact['--t-sm']).toBeTruthy();
    expect(parseFloat(compact['--s3'])).toBeLessThan(parseFloat(spacious['--s3']));
  });

  it('should map motion to the duration tokens', () => {
    const reduced = resolveOverrides({ '--motion': 'reduced' }, 'dark');
    expect(reduced['--dur-move-s']).toBeTruthy();
    expect(reduced['--dur-fx-m']).toBeTruthy();
  });

  it('should collapse reduced motion to near zero', () => {
    // The point of the setting is to stop things moving. A "reduced" that is
    // still 150ms is a setting that does nothing.
    const reduced = resolveOverrides({ '--motion': 'reduced' }, 'dark');
    expect(parseFloat(reduced['--dur-move-s'])).toBeLessThanOrEqual(1);
    expect(parseFloat(reduced['--dur-fx-m'])).toBeLessThanOrEqual(1);
  });

  it('should return nothing for no overrides', () => {
    expect(resolveOverrides({}, 'dark')).toEqual({});
    expect(resolveOverrides(null, 'dark')).toEqual({});
  });
});

describe('JSON export and import', () => {
  it('should round-trip through JSON', () => {
    const o = withOverride(withOverride({}, '--accent', '#123456'), '--radius', 'round');
    const back = overridesFromJson(overridesToJson(o));
    expect(back.ok).toBe(true);
    expect(back.overrides).toEqual(o);
  });

  it('should refuse a file that is not JSON', () => {
    expect(overridesFromJson('not json').ok).toBe(false);
    expect(overridesFromJson('not json').code).toBe('notJson');
  });

  it('should refuse a file that is not an override set', () => {
    // A bundle exported from the history panel is JSON too, and importing it as
    // a theme should say so rather than silently applying nothing.
    expect(overridesFromJson('{"format":"lab-calc.history"}').ok).toBe(false);
    expect(overridesFromJson('{"format":"lab-calc.history"}').code).toBe('notTheme');
  });

  it('should refuse a newer format version rather than importing a subset', () => {
    const doc = JSON.stringify({ format: 'lab-calc.theme', version: 99, overrides: {} });
    const r = overridesFromJson(doc);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('newerVersion');
  });

  it('should drop invalid keys from an imported file', () => {
    const doc = JSON.stringify({
      format: 'lab-calc.theme', version: 1,
      overrides: { '--accent': '#fff', '--text': '#000', evil: 1 },
    });
    const r = overridesFromJson(doc);
    expect(r.ok).toBe(true);
    expect(Object.keys(r.overrides)).toEqual(['--accent']);
  });

  it('should refuse an empty override set rather than claiming success', () => {
    const doc = JSON.stringify({ format: 'lab-calc.theme', version: 1, overrides: {} });
    expect(overridesFromJson(doc).code).toBe('empty');
  });
});

describe('describeOverrides', () => {
  it('should name what is customised, for the settings row', () => {
    const o = withOverride(withOverride({}, '--accent', '#123456'), '--radius', 'sharp');
    const d = describeOverrides(o);
    expect(d.count).toBe(2);
    expect(d.labels).toHaveLength(2);
  });

  it('should return an empty description for no overrides', () => {
    expect(describeOverrides({}).count).toBe(0);
  });
});

describe('the palette stays the base', () => {
  it('should leave every palette token intact when nothing is overridden', () => {
    // The property that makes this safe to ship: a user who customises nothing
    // sees exactly what they saw before.
    for (const key of PALETTE_KEYS) {
      const base = cssVariables(key);
      const resolved = resolveOverrides({}, 'dark');
      for (const name of Object.keys(resolved)) {
        expect(base[name], `${key} ${name}`).toBeUndefined();
      }
    }
  });

  it('should only ever emit tokens the stylesheet already defines', () => {
    // A typo in the override map would set a variable nothing reads, and the
    // setting would appear to do nothing at all.
    const all = resolveOverrides(
      withOverride(withOverride(withOverride({}, '--accent', '#123456'),
        '--radius', 'round'), '--density', 'compact'),
      'dark',
    );
    for (const name of Object.keys(all)) {
      // Every emitted name is either a palette token or one of the fixed
      // scales in styles.css.
      const known = name.startsWith('--r-') || name.startsWith('--s')
        || name.startsWith('--t-') || name.startsWith('--dur-')
        || name.startsWith('--accent') || name === '--brand-deep';
      expect(known, `unexpected token ${name}`).toBe(true);
    }
  });
});

describe('applyTheme with overrides', () => {
  /*
   * The join between the model and the DOM.
   *
   * `resolveOverrides` is covered above; what can still be wrong is the
   * application — an override written before the palette (so the palette wins),
   * or a removed override leaving its old value in the inline style. The second
   * is the one that matters: a user who resets and sees the accent stay red has
   * a reset button that does not reset.
   */
  const fakeRoot = () => {
    const props = new Map();
    return {
      dataset: {},
      style: {
        setProperty: (k, v) => { props.set(k, v); },
        removeProperty: (k) => { props.delete(k); },
      },
      props,
    };
  };

  it('should write the palette first and the override second', async () => {
    const { applyTheme } = await import('../src/ui/theme.mjs');
    const root = fakeRoot();
    applyTheme(root, 'dark', 'dark', { '--accent': '#ff0000' });
    // The palette's own accent is written and then overwritten — the order is
    // what makes the override win.
    expect(root.props.get('--accent')).toBe('#ff0000');
  });

  it('should remove an override token when it is no longer set', async () => {
    /*
     * The failure this catches: `setProperty`-only application leaves the last
     * custom value in the inline style forever, because nothing ever removes
     * it. Reset then appears to do nothing at all.
     *
     * Asserted on the inline style being *absent*, not on it holding the
     * palette's value — `--r-md` is defined in the stylesheet's `:root`, not by
     * `cssVariables`, so removing the override is what lets the stylesheet's
     * value apply again. Writing a value back here would be wrong: it would
     * freeze the radius at today's default.
     */
    const { applyTheme } = await import('../src/ui/theme.mjs');
    const root = fakeRoot();
    applyTheme(root, 'dark', 'dark', { '--accent': '#ff0000', '--radius': 'sharp' });
    expect(root.props.get('--r-md')).toBe('4px');
    expect(root.props.get('--accent')).toBe('#ff0000');

    applyTheme(root, 'dark', 'dark', {});
    // Removed from the inline style, so the stylesheet's own value applies.
    expect(root.props.has('--r-md')).toBe(false);
    expect(root.props.has('--s3')).toBe(false);
    // The accent is a palette token, so the palette's value is written back.
    expect(root.props.get('--accent')).not.toBe('#ff0000');
  });

  it('should keep the customisation across a palette change', async () => {
    // The property the whole design rests on: a user who picks an accent keeps
    // it when they switch palette.
    const { applyTheme } = await import('../src/ui/theme.mjs');
    const root = fakeRoot();
    applyTheme(root, 'dark', 'dark', { '--accent': '#ff0000' });
    applyTheme(root, 'light', 'light', { '--accent': '#ff0000' });
    expect(root.props.get('--accent')).toBe('#ff0000');
  });

  it('should apply no override tokens when given none', async () => {
    const { applyTheme } = await import('../src/ui/theme.mjs');
    const root = fakeRoot();
    applyTheme(root, 'dark', 'dark', null);
    // The three scales are the stylesheet's, never written inline.
    for (const key of ['--r-md', '--s3', '--dur-fx-m']) {
      expect(root.props.has(key), key).toBe(false);
    }
    // And the palette's own tokens are exactly what it declares.
    const { cssVariables } = await import('../src/ui/palettes.mjs');
    const palette = cssVariables('dark');
    expect(root.props.get('--accent')).toBe(palette['--accent']);
  });
});
