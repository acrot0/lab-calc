import { describe, it, expect, beforeEach } from 'vitest';
import {
  claimField, currentFieldLabel, clearField, canFill,
} from '../src/ui/field-bridge.mjs';

/*
 * The fill button must say *where* it will write.
 *
 * Focus is the signal for "the field you were editing", and a target survives
 * losing focus — deliberately, because the user's next action is clicking into
 * the calculator, which is the moment focus leaves. But that means the target
 * can be a field the user focused several tabs ago, and a button reading only
 * 「填入字段」 gives them no way to tell which one. The value lands somewhere off
 * screen and the result is a number in the wrong box.
 *
 * So the bridge carries the label alongside the element, and the button names
 * it. The label comes from the same prop the field renders above itself, so the
 * button and the field cannot disagree about what the field is called.
 */

/** A stand-in for a live input: the bridge only needs `isConnected`. */
const field = (label, connected = true) => ({ label, isConnected: connected });

describe('currentFieldLabel', () => {
  beforeEach(() => clearField());

  it('should be null when nothing has been claimed', () => {
    expect(currentFieldLabel()).toBeNull();
  });

  it('should report the label of the claimed field', () => {
    claimField(field('目标浓度 (mol/L)'), '目标浓度 (mol/L)');
    expect(currentFieldLabel()).toBe('目标浓度 (mol/L)');
  });

  it('should follow the most recent claim', () => {
    claimField(field('体积 (mL)'), '体积 (mL)');
    claimField(field('质量 (g)'), '质量 (g)');
    expect(currentFieldLabel()).toBe('质量 (g)');
  });

  it('should fall back to null for a claim with no label', () => {
    // A caller that does not pass one must not produce `undefined` on screen.
    claimField(field('x'));
    expect(currentFieldLabel()).toBeNull();
  });

  it('should report the label even after the field loses focus', () => {
    // Losing focus does not release the target — that is the whole point of
    // the design, and it is why the label has to be readable without focus.
    const el = field('摩尔质量 (g/mol)');
    claimField(el, '摩尔质量 (g/mol)');
    el.isConnected = true;
    expect(canFill()).toBe(true);
    expect(currentFieldLabel()).toBe('摩尔质量 (g/mol)');
  });

  it('should go null once the field unmounts', () => {
    const el = field('定容体积 (mL)');
    const release = claimField(el, '定容体积 (mL)');
    release();
    expect(currentFieldLabel()).toBeNull();
  });

  it('should not clear a newer label when an older field releases', () => {
    const first = field('a');
    const releaseFirst = claimField(first, 'a');
    claimField(field('b'), 'b');
    releaseFirst();
    expect(currentFieldLabel()).toBe('b');
  });
});
