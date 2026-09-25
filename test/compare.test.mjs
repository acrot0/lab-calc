import { describe, it, expect } from 'vitest';
import {
  COMPARE_KEYS, compareAxes, compareSeries, radarPoint, radarRuns, pathOf, scaleOf,
  SERIES_COLORS, seriesColor,
} from '../src/ui/compare.mjs';
import { ELEMENTS, elementBySymbol } from '../src/calc/elements.mjs';
import { propertiesOf } from '../src/calc/element-properties.mjs';
import { contrastRatio } from '../src/ui/palette.mjs';

/** The function the tab passes in; kept in one place so the tests use the
 *  same wiring the app does rather than a hand-written stand-in. */
const propsFor = (el) => propertiesOf(el.number);

describe('COMPARE_KEYS', () => {
  it('should exclude the year of discovery', () => {
    // Every other axis is a property of the atom or its bulk solid. Plotting
    // the year an element was isolated next to its melting point would invite
    // reading a trend between them.
    expect(COMPARE_KEYS).not.toContain('yearDiscovered');
  });

  it('should contain no duplicates', () => {
    expect(new Set(COMPARE_KEYS).size).toBe(COMPARE_KEYS.length);
  });
});

describe('compareAxes', () => {
  it('should give one axis per key with a real range', () => {
    const axes = compareAxes(ELEMENTS, propsFor);
    expect(axes.length).toBeGreaterThan(0);
    for (const ax of axes) {
      expect(ax.range.count).toBeGreaterThan(0);
      expect(ax.range.max).toBeGreaterThanOrEqual(ax.range.min);
    }
  });

  it('should read each property from the table it actually lives in', () => {
    /*
     * The bug this catches: `propertiesOf` is keyed by atomic number. Handing
     * `rangeOf` the element object instead of its number silently yields null
     * for every PubChem-backed property, and the axis falls back to the empty
     * range — an axis drawn from no data at all.
     */
    const axes = compareAxes(ELEMENTS, propsFor);
    const byKey = Object.fromEntries(axes.map((a) => [a.key, a]));

    // Covalent radius comes from the element table; density from PubChem.
    expect(byKey.rcow.range.min).toBeGreaterThan(0);
    expect(byKey.density.range.min).toBeGreaterThan(0);
    expect(byKey.density.range.count).toBeGreaterThan(50);
    expect(byKey.electronegativity.range.count).toBeGreaterThan(50);
  });

  it('should mark density as logarithmic and electronegativity as linear', () => {
    const byKey = Object.fromEntries(
      compareAxes(ELEMENTS, propsFor).map((a) => [a.key, a]),
    );
    expect(byKey.density.range.log).toBe(true);
    expect(byKey.electronegativity.range.log).toBe(false);
  });

  it('should drop an axis for a property no element has', () => {
    // An axis with no data is a spoke that implies a quantity nobody recorded.
    const axes = compareAxes([], propsFor);
    expect(axes).toEqual([]);
  });

  it('should count how many elements each axis actually covers', () => {
    // Density is measured for most of the table but not all of it, so an axis
    // drawn from that subset must be able to say so rather than implying it
    // covers all 118.
    const byKey = Object.fromEntries(
      compareAxes(ELEMENTS, propsFor).map((a) => [a.key, a]),
    );
    expect(byKey.density.present).toBeGreaterThan(50);
    expect(byKey.density.present).toBeLessThanOrEqual(ELEMENTS.length);
    expect(byKey.electronegativity.present).toBeLessThan(ELEMENTS.length);
  });
});

describe('compareSeries', () => {
  const axes = compareAxes(ELEMENTS, propsFor);

  it('should give every element a point on every axis', () => {
    const series = compareSeries([elementBySymbol('Na'), elementBySymbol('Cl')], axes, propsFor);
    for (const s of series) {
      expect(s.points.length).toBe(axes.length);
    }
  });

  it('should report a missing measurement as null rather than zero', () => {
    // Helium has no electronegativity in the source data — the noble gases
    // have no Pauling value, since the scale is defined by bond energies and
    // they form no ordinary bonds. Reading that as 0 would draw it at the
    // centre of the electronegativity axis, asserting it is the least
    // electronegative element, which is a claim the data does not support.
    const [he] = compareSeries([elementBySymbol('He')], axes, propsFor);
    const en = he.points.find((p) => p.key === 'electronegativity');
    expect(en.value).toBeNull();
    expect(en.pos).toBeNull();
  });

  it('should place the table maximum at the rim and the minimum at the centre', () => {
    const axes2 = compareAxes(ELEMENTS, propsFor);
    const densityAxis = axes2.find((a) => a.key === 'density');
    const series = compareSeries(ELEMENTS, axes2, propsFor);
    const positions = series
      .map((s) => s.points.find((p) => p.key === 'density'))
      .filter((p) => p.pos !== null)
      .map((p) => p.pos);
    expect(Math.min(...positions)).toBeCloseTo(0, 10);
    expect(Math.max(...positions)).toBeCloseTo(1, 10);
    expect(densityAxis.range.max).toBeGreaterThan(1);
  });

  it('should carry the element identity alongside the points', () => {
    const [na] = compareSeries([elementBySymbol('Na')], axes, propsFor);
    expect(na.symbol).toBe('Na');
    expect(na.zh).toBeTruthy();
  });
});

describe('radarPoint', () => {
  it('should put the first axis straight up', () => {
    const p = radarPoint(0, 8, 1, 100);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(-100, 10);
  });

  it('should put a quarter turn at the right', () => {
    const p = radarPoint(2, 8, 1, 100);
    expect(p.x).toBeCloseTo(100, 10);
    expect(p.y).toBeCloseTo(0, 10);
  });

  it('should scale the radius with the normalised value', () => {
    const half = radarPoint(0, 8, 0.5, 100);
    expect(half.y).toBeCloseTo(-50, 10);
  });

  it('should place a zero at the centre', () => {
    const p = radarPoint(3, 8, 0, 100);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(0, 10);
  });
});

describe('radarRuns', () => {
  const axes = compareAxes(ELEMENTS, propsFor);
  const series = compareSeries([elementBySymbol('Na')], axes, propsFor);

  it('should return one closed run when every axis has a value', () => {
    const { runs, closed } = radarRuns(series[0], axes, 90);
    expect(closed).toBe(true);
    expect(runs.length).toBe(1);
    expect(runs[0].length).toBe(axes.length);
  });

  it('should break the outline where a value is missing', () => {
    // Helium has no electronegativity, so its outline is open. Filling an
    // open path would fabricate the area it appears to enclose, which is why
    // the caller is told which case it got.
    const he = compareSeries([elementBySymbol('He')], axes, propsFor)[0];
    const missing = he.points.filter((p) => p.pos === null).length;
    expect(missing, 'helium should be missing at least one comparison property')
      .toBeGreaterThan(0);
    const { closed, runs } = radarRuns(he, axes, 90);
    expect(closed).toBe(false);
    // One gap in the ring means one open run, not two: the vertices either
    // side of it are still connected the long way round.
    expect(runs.length).toBe(1);
    expect(runs[0].length).toBe(axes.length - missing);
  });

  it('should split into two runs when the missing values are not adjacent', () => {
    // A synthetic series with two gaps separated by known values: the outline
    // has to break twice rather than draw a line straight across the data.
    const gaps = new Set([1, 4]);
    const synthetic = {
      symbol: 'Xx',
      points: axes.map((ax, i) => ({
        key: ax.key,
        value: gaps.has(i) ? null : 0.5,
        pos: gaps.has(i) ? null : 0.5,
      })),
    };
    const { runs, closed } = radarRuns(synthetic, axes, 90);
    expect(closed).toBe(false);
    expect(runs.length).toBe(2);
    // Walking from just after the hole at index 1: axes 2 and 3, then axes
    // 5, 6, 7 and 0 — the run that carries the ring's closing edge.
    expect(runs[0].length).toBe(2);
    expect(runs[1].length).toBe(axes.length - 4);
    // Every known vertex is drawn exactly once, across all runs.
    expect(runs.flat().length).toBe(axes.length - gaps.size);
  });

  it('should never emit a run of length zero', () => {
    const he = compareSeries([elementBySymbol('He')], axes, propsFor)[0];
    const { runs } = radarRuns(he, axes, 90);
    for (const run of runs) expect(run.length).toBeGreaterThan(0);
  });

  it('should keep every emitted point inside the radius', () => {
    for (const s of compareSeries(ELEMENTS, axes, propsFor)) {
      const { runs } = radarRuns(s, axes, 90);
      for (const run of runs) {
        for (const p of run) {
          expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(90 + 1e-9);
        }
      }
    }
  });
});

describe('pathOf', () => {
  it('should emit an empty path for no points', () => {
    expect(pathOf([])).toBe('');
  });

  it('should start with a move and continue with lines', () => {
    expect(pathOf([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe('M0.00 0.00 L1.00 1.00');
  });

  it('should close only when asked', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expect(pathOf(pts)).not.toContain('Z');
    expect(pathOf(pts, true).endsWith('Z')).toBe(true);
  });
});

describe('scaleOf', () => {
  it('should name the notation the axis uses', () => {
    expect(scaleOf({ log: true })).toBe('sci');
    expect(scaleOf({ log: false })).toBe('plain');
  });
});

describe('seriesColor', () => {
  /*
   * The comparison draws up to four outlines, and on a light surface the
   * unmodified Okabe-Ito set fails: its yellow reaches 1.32:1 against white
   * and its orange 2.25:1, so the fourth element added is the least visible
   * one on the chart. These assertions pin the floor rather than the exact
   * hex values, so a future palette tweak is free as long as it stays legible.
   */
  const SURFACE = { dark: '#12161d', light: '#ffffff' };

  it('should clear the contrast floor on its own surface in both themes', () => {
    for (const [theme, surface] of Object.entries(SURFACE)) {
      SERIES_COLORS[theme].forEach((hex, i) => {
        const ratio = contrastRatio(hex, surface);
        expect(ratio, `${theme} colour ${i} (${hex}) is too faint on ${surface}`)
          .toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  it('should give the first four elements four different colours', () => {
    const four = [0, 1, 2, 3].map((i) => seriesColor(i, 'dark'));
    expect(new Set(four).size).toBe(4);
  });

  it('should wrap rather than return undefined past the end of the palette', () => {
    // The comparison caps at four, but a colour function that returns
    // undefined for index 8 would draw an invisible outline rather than throw.
    expect(seriesColor(8, 'dark')).toBe(seriesColor(0, 'dark'));
    expect(seriesColor(9, 'dark')).toBe(seriesColor(1, 'dark'));
  });

  it('should fall back to the dark set for an unknown theme', () => {
    expect(seriesColor(0, 'sepia')).toBe(seriesColor(0, 'dark'));
  });
});
