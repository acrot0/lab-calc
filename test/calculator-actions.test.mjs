import { describe, expect, it } from 'vitest';
import { ACTIONS, accumulate, asQuantity } from '../src/ui/components/calculator-actions.mjs';

/*
 * The keypad's behaviour, exercised without rendering.
 *
 * These are the cases that are easy to get wrong and invisible in a browser:
 * a memory that stores a unit, an empty memory that a first `M+` should fill,
 * and an entry that must not be poisoned by an infinite result.
 */

/** A context that records what an action did, so the change can be asserted. */
function ctx(over = {}) {
  const c = {
    src: '',
    memory: null,
    last: null,
    result: null,
    ...over,
  };
  c.setSrc = (v) => { c.src = typeof v === 'function' ? v(c.src) : v; };
  c.setMemory = (v) => { c.memory = typeof v === 'function' ? v(c.memory) : v; };
  c.formatNumber = (v) => Number(v.toPrecision(12)).toString();
  c.commit = () => { c.committed = true; };
  return c;
}

const run = (name, c) => ACTIONS[name](c);

describe('asQuantity', () => {
  it('should carry the unit and the dimension vector through', () => {
    // Without the exponents, `ans * 2` after a `20 g/L` answer would come back
    // as a bare 40 and the unit would be silently lost.
    const q = asQuantity({ value: 20, unit: 'g/L', exponents: [1, -3, 0, 0, 0, 0] });
    expect(q).toEqual({ value: 20, unit: 'g/L', exponents: [1, -3, 0, 0, 0, 0] });
  });

  it('should return null for an error state or a missing value', () => {
    expect(asQuantity(null)).toBeNull();
    expect(asQuantity({ error: 'expressionSyntax' })).toBeNull();
    expect(asQuantity({ value: null })).toBeNull();
  });

  it('should default the exponents when a result has none', () => {
    expect(asQuantity({ value: 5 }).exponents).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('accumulate', () => {
  it('should store on an empty memory rather than treating it as zero', () => {
    // The first press of `M+` is the one the user meant. Making it a no-op
    // against a notional zero would mean every first press is swallowed.
    const m = accumulate(null, { value: 7, unit: 'g', exponents: [1, 0, 0, 0, 0, 0] }, 1);
    expect(m.value).toBe(7);
    expect(m.unit).toBe('g');
  });

  it('should negate when subtracting from an empty memory', () => {
    expect(accumulate(null, { value: 7, exponents: [0, 0, 0, 0, 0, 0] }, -1).value).toBe(-7);
  });

  it('should add and subtract against an occupied memory', () => {
    const base = { value: 10, unit: 'g', exponents: [1, 0, 0, 0, 0, 0] };
    expect(accumulate(base, { value: 5, exponents: [1, 0, 0, 0, 0, 0] }, 1).value).toBe(15);
    expect(accumulate(base, { value: 5, exponents: [1, 0, 0, 0, 0, 0] }, -1).value).toBe(5);
  });

  it('should keep the memory unit and not adopt the addend unit', () => {
    const base = { value: 10, unit: 'g', exponents: [1, 0, 0, 0, 0, 0] };
    const next = accumulate(base, { value: 5, exponents: [1, 0, 0, 0, 0, 0] }, 1);
    expect(next.unit).toBe('g');
  });

  it('should leave the memory alone when the result is not finite', () => {
    // An Infinity in the memory would poison every later recall with no way for
    // the user to see where it came from.
    const base = { value: 10, unit: 'g', exponents: [1, 0, 0, 0, 0, 0] };
    const next = accumulate(base, { value: Number.POSITIVE_INFINITY, exponents: [0, 0, 0, 0, 0, 0] }, 1);
    expect(next).toBe(base);
  });

  it('should leave the memory alone when there is nothing to add', () => {
    const base = { value: 10, unit: 'g', exponents: [1, 0, 0, 0, 0, 0] };
    expect(accumulate(base, null, 1)).toBe(base);
  });
});

describe('calculator actions', () => {
  it('should clear the whole entry', () => {
    const c = ctx({ src: '1+2' });
    run('clear', c);
    expect(c.src).toBe('');
  });

  it('should delete one character on backspace', () => {
    const c = ctx({ src: '1+2' });
    run('back', c);
    expect(c.src).toBe('1+');
  });

  it('should negate the whole entry and un-negate it again', () => {
    const c = ctx({ src: '1+2' });
    run('negate', c);
    expect(c.src).toBe('-1+2');
    run('negate', c);
    expect(c.src).toBe('1+2');
  });

  it('should commit on equals', () => {
    const c = ctx();
    run('equals', c);
    expect(c.committed).toBe(true);
  });

  it('should add the current result to the memory', () => {
    const c = ctx({ result: { value: 3, exponents: [0, 0, 0, 0, 0, 0] } });
    run('memAdd', c);
    expect(c.memory.value).toBe(3);
  });

  it('should fall back to the last answer when there is no current result', () => {
    // Pressing `M+` on an entry that does not evaluate should store the last
    // good answer, not silently do nothing.
    const c = ctx({ last: { value: 9, exponents: [0, 0, 0, 0, 0, 0] } });
    run('memAdd', c);
    expect(c.memory.value).toBe(9);
  });

  it('should do nothing when there is neither a result nor a last answer', () => {
    const c = ctx();
    run('memAdd', c);
    expect(c.memory).toBeNull();
  });

  it('should recall the memory into the entry', () => {
    const c = ctx({ src: '2*', memory: { value: 12.5, exponents: [0, 0, 0, 0, 0, 0] } });
    run('memRecall', c);
    expect(c.src).toBe('2*12.5');
  });

  it('should carry the unit on recall, bracketed so it composes', () => {
    // A memory holding `40 g/L` that recalls as a bare `40` has dropped the one
    // thing the value meant. The brackets are what keep `2 * MR` from dividing
    // the 2 by the litre.
    const c = ctx({
      src: '2*',
      memory: { value: 40, unit: 'g/L', exponents: [1, -3, 0, 0, 0, 0] },
    });
    run('memRecall', c);
    expect(c.src).toBe('2*(40 g/L)');
  });

  it('should recall a zero when the memory is empty', () => {
    // Inserting nothing would look like the key was dead.
    const c = ctx({ src: '' });
    run('memRecall', c);
    expect(c.src).toBe('0');
  });

  it('should clear the memory', () => {
    const c = ctx({ memory: { value: 1, exponents: [0, 0, 0, 0, 0, 0] } });
    run('memClear', c);
    expect(c.memory).toBeNull();
  });

  it('should name every action the key tables could use', () => {
    for (const name of ['clear', 'back', 'equals', 'negate', 'memAdd', 'memSub', 'memRecall', 'memClear']) {
      expect(typeof ACTIONS[name], `${name} is not implemented`).toBe('function');
    }
  });
});
