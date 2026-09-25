import { describe, it, expect } from 'vitest';
import { ELEMENT_PROPERTIES, propertiesOf } from '../src/calc/element-properties.mjs';
import { ELEMENTS, elementBySymbol } from '../src/calc/elements.mjs';

/**
 * These values come from PubChem, so the tests cannot re-derive them — the
 * point is to pin the ones a wrong transcription would silently change, and to
 * hold the shape steady for the UI.
 *
 * The spot values are the ones a chemist would notice: a melting point off by
 * 1000 K, an electronegativity on the wrong side of 2, water boiling at the
 * wrong temperature.
 */
describe('element properties', () => {
  it('should have one entry per element, in atomic-number order', () => {
    expect(ELEMENT_PROPERTIES).toHaveLength(118);
    ELEMENT_PROPERTIES.forEach((p, i) => {
      expect(p.number, `entry ${i} number`).toBe(i + 1);
    });
  });

  it('should cover every element the table knows about', () => {
    for (const el of ELEMENTS) {
      expect(propertiesOf(el.number), `${el.symbol} properties`).not.toBeNull();
    }
  });

  it('should key by atomic number, not by array position', () => {
    // The lookup is 1-based on purpose: element 1 is index 0. An off-by-one
    // here would give every element its neighbour's properties, which looks
    // plausible on screen and is wrong everywhere.
    expect(propertiesOf(1).melt).toBeCloseTo(13.81, 2);
    expect(propertiesOf(26).melt).toBeCloseTo(1811, 0);
    expect(propertiesOf(79).density).toBeCloseTo(19.282, 2);
    expect(propertiesOf(118)).not.toBeNull();
    expect(propertiesOf(119)).toBeNull();
    expect(propertiesOf(0)).toBeNull();
  });

  it('should pin the electronegativities a chemist would check first', () => {
    const en = (s) => propertiesOf(elementBySymbol(s).number).electronegativity;
    expect(en('F')).toBeCloseTo(3.98, 2);   // the most electronegative element
    expect(en('O')).toBeCloseTo(3.44, 2);
    expect(en('H')).toBeCloseTo(2.2, 2);
    expect(en('C')).toBeCloseTo(2.55, 2);
    expect(en('Na')).toBeCloseTo(0.93, 2);
    expect(en('Cs')).toBeCloseTo(0.79, 2);  // the least, among stable elements
  });

  it('should pin melting and boiling points in kelvin', () => {
    const of = (s) => propertiesOf(elementBySymbol(s).number);
    expect(of('H').boil).toBeCloseTo(20.28, 1);
    expect(of('O').boil).toBeCloseTo(90.2, 1);
    expect(of('Fe').melt).toBeCloseTo(1811, 0);
    expect(of('W').melt).toBeCloseTo(3695, 0);   // highest of any metal
    expect(of('C').melt).toBeCloseTo(3823, 0);   // highest overall
  });

  it('should keep the melting point below the boiling point, except for arsenic', () => {
    // Arsenic sublimes: it passes from solid to vapour at 887 K without a
    // liquid phase at ordinary pressure, so its listed "boiling point" is
    // below its 1090 K melting point. That is chemistry, not a transcription
    // error — and it is the only element where it happens, so an exception
    // here is safer than dropping the check that catches a swapped column.
    const SUBLIMES = new Set(['As']);
    for (const p of ELEMENT_PROPERTIES) {
      if (p.melt === null || p.boil === null) continue;
      if (SUBLIMES.has(ELEMENTS[p.number - 1].symbol)) continue;
      expect(p.melt, `element ${p.number} melt < boil`).toBeLessThan(p.boil);
    }
  });

  it('should pin densities in g/cm3', () => {
    const d = (s) => propertiesOf(elementBySymbol(s).number).density;
    expect(d('Os')).toBeCloseTo(22.57, 1);   // the densest element
    expect(d('Au')).toBeCloseTo(19.282, 2);
    expect(d('Fe')).toBeCloseTo(7.874, 2);
    expect(d('H')).toBeCloseTo(0.00008988, 7);  // a gas, hence the exponent
  });

  it('should give every element an oxidation-state list, empty only for nihonium', () => {
    // Nihonium (113) has no measured chemistry to speak of: a handful of atoms
    // at a time, and no oxidation state has been established. An empty array
    // says that; a fabricated [3] would not.
    for (const p of ELEMENT_PROPERTIES) {
      if (ELEMENTS[p.number - 1].symbol === 'Nh') continue;
      expect(p.oxidationStates.length, `element ${p.number}`).toBeGreaterThan(0);
    }
    expect(propertiesOf(elementBySymbol('Nh').number).oxidationStates).toEqual([]);
  });

  it('should list the most common oxidation state first', () => {
    // PubChem orders by prominence, and the UI shows the list in that order —
    // a sort here would bury the state a student is looking for.
    const of = (s) => propertiesOf(elementBySymbol(s).number).oxidationStates;
    expect(of('Na')).toEqual([1]);
    expect(of('Fe')[0]).toBe(3);
    expect(of('O')).toEqual([-2]);
    expect(of('Cl')[0]).toBe(7);
  });

  it('should pin the first ionization energies in eV', () => {
    const of = (s) => propertiesOf(elementBySymbol(s).number).ionization;
    expect(of('H')).toBeCloseTo(13.598, 2);
    expect(of('He')).toBeCloseTo(24.587, 2);  // highest of any element
    expect(of('Cs')).toBeCloseTo(3.894, 2);   // lowest of the stable ones
  });

  it('should use null, never zero, for a value that was never measured', () => {
    // Zero is a plausible-looking number here, and rendering "0 K" for an
    // element nobody has measured would be a fabrication rather than a gap.
    const he = propertiesOf(2);
    expect(he.electronegativity).toBeNull();
    expect(propertiesOf(104).melt).toBeNull();  // rutherfordium
    for (const p of ELEMENT_PROPERTIES) {
      for (const k of ['electronegativity', 'melt', 'boil', 'density', 'ionization', 'yearDiscovered']) {
        expect(p[k], `element ${p.number} ${k}`).not.toBe(0);
      }
    }
  });

  it('should leave the year null for elements known since antiquity', () => {
    // PubChem says "Ancient" for these; storing 0 or -1 would sort them as
    // "discovered in year zero" in any timeline the UI might build.
    for (const s of ['C', 'Fe', 'Cu', 'Au', 'Pb']) {
      expect(propertiesOf(elementBySymbol(s).number).yearDiscovered, s).toBeNull();
    }
    expect(propertiesOf(elementBySymbol('U').number).yearDiscovered).toBe(1789);
    expect(propertiesOf(elementBySymbol('O').number).yearDiscovered).toBe(1774);
  });

  it('should keep every discovery year within recorded history', () => {
    for (const p of ELEMENT_PROPERTIES) {
      if (p.yearDiscovered === null) continue;
      expect(p.yearDiscovered, `element ${p.number}`).toBeGreaterThanOrEqual(1600);
      expect(p.yearDiscovered, `element ${p.number}`).toBeLessThanOrEqual(2030);
    }
  });
});
