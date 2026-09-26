import { describe, it, expect } from 'vitest';
import {
  parseEquation, balanceEquation, limitingReagent, empiricalFormula, percentComposition,
  yieldSweep,
} from '../src/calc/reaction.mjs';

const coef = (r, side) => r[side].map((s) => s.coefficient);

describe('parseEquation', () => {
  it('should split an equation on the arrow into reactants and products', () => {
    const r = parseEquation('Fe + O2 -> Fe2O3');
    expect(r.reactants).toEqual(['Fe', 'O2']);
    expect(r.products).toEqual(['Fe2O3']);
  });

  it('should accept the unicode arrow and the equals sign as separators', () => {
    expect(parseEquation('H2 + Cl2 → HCl').products).toEqual(['HCl']);
    expect(parseEquation('H2 + Cl2 = HCl').reactants).toEqual(['H2', 'Cl2']);
  });

  it('should strip a leading coefficient the user typed', () => {
    expect(parseEquation('2H2 + O2 -> 2H2O').reactants).toEqual(['H2', 'O2']);
  });

  it('should work without spaces around the plus signs', () => {
    expect(parseEquation('C3H8+O2->CO2+H2O').reactants).toEqual(['C3H8', 'O2']);
  });

  it('should reject an empty side', () => {
    expect(() => parseEquation('Fe + -> Fe2O3')).toThrow(/equationMalformed/);
    expect(() => parseEquation('-> Fe2O3')).toThrow(/equationMalformed/);
  });

  it('should reject text with no arrow at all', () => {
    expect(() => parseEquation('Fe + O2')).toThrow(/equationMalformed/);
  });

  it('should reject a dangling plus rather than silently dropping a species', () => {
    // "Fe2+ + e-" splits into an empty token; dropping it would balance an
    // equation the user did not write.
    expect(() => parseEquation('Fe2+ + e- -> Fe')).toThrow(/equationMalformed/);
  });

  it('should not validate formulas — that is the balancer\'s job', () => {
    // parseEquation is purely textual. Validating here would make it depend on
    // the element table for no gain, and the balancer has to walk every formula
    // anyway to build the conservation matrix.
    expect(parseEquation('Xx2 + O2 -> XxO').reactants).toEqual(['Xx2', 'O2']);
  });
});

describe('balanceEquation', () => {
  it('should balance the formation of rust', () => {
    const r = balanceEquation({ equation: 'Fe + O2 -> Fe2O3' });
    expect(coef(r, 'reactants')).toEqual([4, 3]);
    expect(coef(r, 'products')).toEqual([2]);
  });

  it('should balance propane combustion', () => {
    const r = balanceEquation({ equation: 'C3H8 + O2 -> CO2 + H2O' });
    expect(coef(r, 'reactants')).toEqual([1, 5]);
    expect(coef(r, 'products')).toEqual([3, 4]);
  });

  it('should balance a redox equation with five products and six elements', () => {
    const r = balanceEquation({ equation: 'KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2' });
    expect(coef(r, 'reactants')).toEqual([2, 16]);
    expect(coef(r, 'products')).toEqual([2, 2, 8, 5]);
  });

  it('should balance the copper and nitric acid reaction', () => {
    const r = balanceEquation({ equation: 'Cu + HNO3 -> Cu(NO3)2 + NO + H2O' });
    expect(coef(r, 'reactants')).toEqual([3, 8]);
    expect(coef(r, 'products')).toEqual([3, 2, 4]);
  });

  it('should reduce a scaled equation to its smallest integers', () => {
    // "4H2 + 2O2 -> 4H2O" is correct but not reduced; the answer is 2,1,2.
    const r = balanceEquation({ equation: '4H2 + 2O2 -> 4H2O' });
    expect(coef(r, 'reactants')).toEqual([2, 1]);
    expect(coef(r, 'products')).toEqual([2]);
  });

  it('should keep the species in the order the user wrote them', () => {
    const r = balanceEquation({ equation: 'H2O + CO2 -> C6H12O6 + O2' });
    expect(r.reactants.map((s) => s.formula)).toEqual(['H2O', 'CO2']);
    expect(r.products.map((s) => s.formula)).toEqual(['C6H12O6', 'O2']);
    expect(coef(r, 'reactants')).toEqual([6, 6]);
    expect(coef(r, 'products')).toEqual([1, 6]);
  });

  it('should refuse an equation that cannot balance', () => {
    // Nitrogen appears only among the products, so the only solution has its
    // coefficient at zero — which is not a reaction. A balancer that returns
    // 0 for a species has silently deleted it from the equation.
    expect(() => balanceEquation({ equation: 'H2 + O2 -> H2O + N2' })).toThrow(/cannotBalance/);
  });

  it('should report an unknown element rather than skipping it', () => {
    expect(() => balanceEquation({ equation: 'Xx2 + O2 -> XxO' })).toThrow(/unknownElement/);
  });
});

describe('percentComposition', () => {
  it('should give the mass percent of each element in water', () => {
    const r = percentComposition({ formula: 'H2O' });
    const byEl = Object.fromEntries(r.map((e) => [e.element, e.massPercent]));
    expect(byEl.H).toBeCloseTo(11.19, 2);
    expect(byEl.O).toBeCloseTo(88.81, 2);
  });

  it('should sum to 100 percent', () => {
    const r = percentComposition({ formula: 'KMnO4' });
    const total = r.reduce((s, e) => s + e.massPercent, 0);
    expect(total).toBeCloseTo(100, 6);
  });
});

describe('empiricalFormula', () => {
  it('should give CH2O from percent composition', () => {
    const r = empiricalFormula({
      entries: [
        { element: 'C', amount: 40 },
        { element: 'H', amount: 6.72 },
        { element: 'O', amount: 53.28 },
      ],
    });
    expect(r.formula).toBe('CH2O');
    expect(r.molarMass).toBeCloseTo(30.026, 2);
  });

  it('should give the molecular formula when the molar mass is supplied', () => {
    const r = empiricalFormula({
      entries: [
        { element: 'C', amount: 40 },
        { element: 'H', amount: 6.72 },
        { element: 'O', amount: 53.28 },
      ],
      molarMassGmol: 180.156,
    });
    expect(r.formula).toBe('C6H12O6');
    expect(r.multiplier).toBe(6);
  });

  it('should give CH4 from raw masses', () => {
    // Masses and percents are the same problem: only the ratio matters.
    const r = empiricalFormula({
      entries: [{ element: 'C', amount: 12 }, { element: 'H', amount: 4 }],
    });
    expect(r.formula).toBe('CH4');
  });

  it('should report the mole ratio it derived', () => {
    const r = empiricalFormula({
      entries: [{ element: 'Fe', amount: 55.845 }, { element: 'O', amount: 15.999 }],
    });
    expect(r.formula).toBe('FeO');
    expect(r.ratios[0].ratio).toBeCloseTo(1, 6);
  });

  it('should reject an unknown element', () => {
    expect(() => empiricalFormula({ entries: [{ element: 'Xx', amount: 10 }] })).toThrow(/unknownElement/);
  });

  it('should reject a non-positive amount', () => {
    expect(() => empiricalFormula({ entries: [{ element: 'C', amount: 0 }] })).toThrow(/mustBePositive/);
  });

  it('should reject an empty entry list', () => {
    expect(() => empiricalFormula({ entries: [] })).toThrow(/componentsEmpty/);
  });
});

describe('limitingReagent', () => {
  const EQ = 'H2 + O2 -> H2O';

  it('should pick the reagent that runs out first', () => {
    const r = limitingReagent({
      equation: EQ,
      amounts: [
        { formula: 'H2', amount: 4, unit: 'g' },
        { formula: 'O2', amount: 16, unit: 'g' },
      ],
    });
    expect(r.limiting).toBe('O2');
    expect(r.extent).toBeCloseTo(0.500031, 5);
  });

  it('should give the theoretical yield of every product', () => {
    const r = limitingReagent({
      equation: EQ,
      amounts: [
        { formula: 'H2', amount: 4, unit: 'g' },
        { formula: 'O2', amount: 16, unit: 'g' },
      ],
    });
    expect(r.products[0].formula).toBe('H2O');
    expect(r.products[0].moles).toBeCloseTo(1.000063, 5);
    expect(r.products[0].massG).toBeCloseTo(18.0161, 3);
  });

  it('should report how much of the excess reagent is left over', () => {
    const r = limitingReagent({
      equation: EQ,
      amounts: [
        { formula: 'H2', amount: 4, unit: 'g' },
        { formula: 'O2', amount: 16, unit: 'g' },
      ],
    });
    expect(r.excess).toHaveLength(1);
    expect(r.excess[0].formula).toBe('H2');
    expect(r.excess[0].molesLeft).toBeCloseTo(0.984064, 5);
    expect(r.excess[0].massG).toBeCloseTo(1.984, 3);
  });

  it('should accept moles as the unit', () => {
    const r = limitingReagent({
      equation: EQ,
      amounts: [
        { formula: 'H2', amount: 3, unit: 'mol' },
        { formula: 'O2', amount: 2, unit: 'mol' },
      ],
    });
    expect(r.limiting).toBe('H2');
    expect(r.extent).toBeCloseTo(1.5, 9);
  });

  it('should call a tie for the first reagent rather than inventing a winner', () => {
    const r = limitingReagent({
      equation: EQ,
      amounts: [
        { formula: 'H2', amount: 2, unit: 'mol' },
        { formula: 'O2', amount: 1, unit: 'mol' },
      ],
    });
    expect(r.limiting).toBe('H2');
    expect(r.excess).toHaveLength(0);
  });

  it('should compute the percent yield against a chosen product', () => {
    const r = limitingReagent({
      equation: EQ,
      amounts: [
        { formula: 'H2', amount: 4, unit: 'g' },
        { formula: 'O2', amount: 16, unit: 'g' },
      ],
      yieldOf: 'H2O',
      actualG: 15,
    });
    expect(r.percentYield).toBeCloseTo(83.26, 1);
  });

  it('should reject a missing amount for one of the reactants', () => {
    expect(() => limitingReagent({
      equation: EQ,
      amounts: [{ formula: 'H2', amount: 4, unit: 'g' }],
    })).toThrow(/amountMissing/);
  });

  it('should reject a formula that is not a reactant', () => {
    expect(() => limitingReagent({
      equation: EQ,
      amounts: [
        { formula: 'H2', amount: 4, unit: 'g' },
        { formula: 'O2', amount: 16, unit: 'g' },
        { formula: 'H2O', amount: 1, unit: 'g' },
      ],
    })).toThrow(/notAReactant/);
  });

  it('should reject an unknown unit', () => {
    expect(() => limitingReagent({
      equation: EQ,
      amounts: [
        { formula: 'H2', amount: 4, unit: 'lb' },
        { formula: 'O2', amount: 16, unit: 'g' },
      ],
    })).toThrow(/unknownUnit/);
  });
});

describe('yieldSweep', () => {
  /*
   * The chart's claim, asserted as arithmetic: the yield rises while the varied
   * reactant limits, then stops. If this ever stops being true the chart is
   * drawing a line that means something other than what its caption says.
   */
  const base = {
    equation: 'Fe + O2 -> Fe2O3',
    amounts: [{ formula: 'O2', amount: 8, unit: 'g' }],
    varyOf: 'Fe',
    yieldOf: 'Fe2O3',
  };

  it('should put the corner at the balanced ratio', () => {
    // 4 Fe + 3 O2 -> 2 Fe2O3. 8 g O2 is 8/31.998 = 0.25 mol, which needs
    // 0.25 * 4/3 = 0.3333 mol Fe.
    //
    // Checked to four places rather than six: the corner is computed through
    // O2's molar mass, which is 31.998 g/mol, so the input is 0.250016 mol
    // rather than exactly 0.25. That 2e-5 is the atomic weights' precision
    // showing through, not an error in the ratio.
    const r = yieldSweep({ ...base, steps: 8 });
    expect(r.cornerMoles).toBeCloseTo(0.25 * (4 / 3), 4);
    expect(r.cornerRatio).toBe(4);
  });

  it('should rise before the corner and be flat after it', () => {
    const r = yieldSweep({ ...base, steps: 60 });
    const before = r.points.filter((p) => p.molesVary < r.cornerMoles);
    const after = r.points.filter((p) => p.molesVary > r.cornerMoles);

    for (let i = 1; i < before.length; i++) {
      expect(before[i].massProduct, `step ${i}`).toBeGreaterThan(before[i - 1].massProduct);
    }
    for (const p of after) {
      expect(p.massProduct).toBeCloseTo(r.maxMassProduct, 9);
    }
  });

  it('should mark which reactant is limiting on each point', () => {
    const r = yieldSweep({ ...base, steps: 20 });
    for (const p of r.points) {
      // At exactly the corner both are limiting; the strict comparison leaves
      // that point unmarked, which is the honest reading of a tie.
      if (p.molesVary < r.cornerMoles) expect(p.limiting).toBe('Fe');
      if (p.molesVary > r.cornerMoles) expect(p.limiting).toBeNull();
    }
  });

  it('should sweep to twice the corner so the plateau is on screen', () => {
    // Stopping at the corner would draw only the rising half, and the flat run
    // is the half that carries the lesson.
    const r = yieldSweep({ ...base, steps: 10 });
    const last = r.points[r.points.length - 1];
    expect(last.molesVary).toBeCloseTo(r.cornerMoles * 2, 9);
  });

  it('should give the same corner regardless of the units the user typed', () => {
    /*
     * The corner is a property of the reaction, not of the batch. A user who
     * typed 0.25 mol of O2 sees the same ratio as one who typed 8 g.
     */
    const inGrams = yieldSweep({ ...base, steps: 4 });
    const inMoles = yieldSweep({
      ...base,
      amounts: [{ formula: 'O2', amount: 0.25, unit: 'mol' }],
      steps: 4,
    });
    expect(inMoles.cornerMoles).toBeCloseTo(inGrams.cornerMoles, 4);
    expect(inMoles.cornerRatio).toBe(inGrams.cornerRatio);
  });

  it('should reject a reactant that is not in the equation', () => {
    expect(() => yieldSweep({ ...base, varyOf: 'Au' })).toThrow();
  });

  it('should reject a product that is not in the equation', () => {
    expect(() => yieldSweep({ ...base, yieldOf: 'H2O' })).toThrow();
  });
});
