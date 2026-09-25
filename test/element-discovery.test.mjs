/**
 * Tests for the hand-curated discovery data.
 *
 * The bug these exist for: the detail panel showed aluminium and calcium as
 * "known since antiquity". PubChem's periodic table marks both "Ancient" in its
 * YearDiscovered column, the generator turned that string into null, and the UI
 * faithfully rendered null as "ancient" — so the app was reporting bad upstream
 * data as if it were a fact about the element. Someone using the table to check
 * when aluminium was discovered got a wrong answer, and nothing in the suite
 * noticed, because every test agreed with the data it was testing.
 *
 * These tests are written against known values rather than against the data
 * file, so they fail if the data regresses rather than merely change with it.
 */

import { describe, expect, it } from 'vitest';
import { DISCOVERY, ERA_KINDS, discoveryOf } from '../src/calc/element-discovery.mjs';
import { ELEMENT_PROPERTIES, propertiesOf } from '../src/calc/element-properties.mjs';
import { ELEMENTS, elementBySymbol } from '../src/calc/elements.mjs';

const byNumber = (z) => discoveryOf(z);

describe('element discovery', () => {
  it('should cover every element exactly once', () => {
    expect(DISCOVERY).toHaveLength(118);
    for (let z = 1; z <= 118; z++) {
      expect(byNumber(z), `element ${z}`).not.toBeNull();
      expect(byNumber(z).number, `element ${z}`).toBe(z);
    }
    expect(byNumber(0)).toBeNull();
    expect(byNumber(119)).toBeNull();
  });

  it('should give the textbook year for the elements PubChem gets wrong', () => {
    // The two the user reported. Both were null ("Ancient") before the fix.
    expect(byNumber(elementBySymbol('Al').number)).toMatchObject({ year: 1825, by: 'H. C. Ørsted' });
    expect(byNumber(elementBySymbol('Ca').number)).toMatchObject({ year: 1808, by: 'H. Davy' });
    // Three more wrong in the same column, found while checking those two.
    expect(byNumber(elementBySymbol('F').number).year).toBe(1886);   // not Scheele's 1670
    expect(byNumber(elementBySymbol('Si').number).year).toBe(1823);  // not 1854
    expect(byNumber(elementBySymbol('Ru').number).year).toBe(1844);  // not 1827
  });

  it('should agree with the properties table it feeds', () => {
    // The two files are generated from different places, so this is the check
    // that the override in the generator actually took effect. Drift here means
    // the colour-by-year ramp and the detail panel would disagree.
    for (const d of DISCOVERY) {
      expect(propertiesOf(d.number).yearDiscovered, `element ${d.number}`).toBe(d.year);
    }
  });

  it('should not call an element ancient when it was isolated in the 1800s', () => {
    // The shape of the original bug: a null year renders as "known since
    // antiquity". Any element with a named discoverer must have a year.
    for (const d of DISCOVERY) {
      if (d.era) continue;
      expect(d.year, `element ${d.number} has a discoverer but no year`).not.toBeNull();
      expect(d.year, `element ${d.number}`).toBeGreaterThanOrEqual(1600);
      expect(d.year, `element ${d.number}`).toBeLessThanOrEqual(2030);
    }
  });

  it('should carry an era instead of a year for the elements known since antiquity', () => {
    const ancient = DISCOVERY.filter((d) => d.era);
    expect(ancient.length).toBeGreaterThan(0);
    for (const d of ancient) {
      // A year and an era together would be ambiguous: is 3000 BC a year or a
      // range? The two are mutually exclusive by construction.
      expect(d.year, `element ${d.number}`).toBeNull();
      expect(ERA_KINDS, `element ${d.number} era kind`).toContain(d.era.kind);
      expect(d.era.years, `element ${d.number}`).toBeGreaterThan(0);
      expect(d.era.years, `element ${d.number}`).toBeLessThanOrEqual(100000);
    }
    // The two the user reported must NOT be in this set any more.
    const ancientNumbers = new Set(ancient.map((d) => d.number));
    expect(ancientNumbers.has(elementBySymbol('Al').number)).toBe(false);
    expect(ancientNumbers.has(elementBySymbol('Ca').number)).toBe(false);
  });

  it('should name a discoverer for every element', () => {
    for (const d of DISCOVERY) {
      expect(typeof d.by, `element ${d.number}`).toBe('string');
      expect(d.by.trim().length, `element ${d.number}`).toBeGreaterThan(0);
      // A placeholder that reached production would render as literal "TBD".
      expect(d.by, `element ${d.number}`).not.toMatch(/TODO|TBD|unknown|\?\?\?/i);
    }
  });

  it('should key the rows by atomic number, not by position', () => {
    // discoveryOf indexes an array. If the rows were ever reordered or one were
    // dropped, every element after it would silently report its neighbour's
    // discoverer — so the number field is checked against the array index.
    DISCOVERY.forEach((d, i) => {
      expect(d.number, `row ${i}`).toBe(i + 1);
      expect(d.number, `row ${i}`).toBe(ELEMENTS[i].number);
    });
  });

  it('should stay aligned with the properties table row count', () => {
    expect(DISCOVERY).toHaveLength(ELEMENT_PROPERTIES.length);
  });
});
