import { describe, it, expect } from 'vitest';
import { errorMessage } from '../src/ui/errors.mjs';
import { CalcError } from '../src/calc/errors.mjs';
import { zh } from '../src/ui/locales/zh.mjs';
import { en } from '../src/ui/locales/en.mjs';

/** Minimal `t` matching the real one: dot-path lookup plus {placeholder} substitution. */
function makeT(dict) {
  return (key, params) => {
    const raw = key.split('.').reduce((a, c) => (a == null ? a : a[c]), dict);
    if (typeof raw !== 'string') return key;
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  };
}

const t = makeT(zh);
const tEn = makeT(en);

describe('errorMessage', () => {
  it('should translate a coded error into the current language', () => {
    const e = new CalcError('mustBePositive', { name: 'volume', value: 0 });
    expect(errorMessage(e, t)).toBe('体积必须大于 0（当前为 0）');
    expect(errorMessage(e, tEn)).toBe('Volume must be greater than 0 (got 0)');
  });

  it('should translate the field name, not just the template', () => {
    // Without the second lookup an English user is told about a field called
    // "浓度", which is worse than no message at all.
    const e = new CalcError('mustBePositive', { name: 'molarity', value: -1 });
    expect(errorMessage(e, tEn)).not.toContain('浓度');
    expect(errorMessage(e, tEn)).toContain('Concentration');
  });

  it('should separate a Latin field name from a following CJK word', () => {
    // "反应商 Q" + "必须大于 0" renders as "反应商 Q必须大于 0" without a space.
    const e = new CalcError('mustBePositive', { name: 'reactionQuotient', value: 0 });
    expect(errorMessage(e, t)).toBe('反应商 Q 必须大于 0（当前为 0）');
  });

  it('should not add a space when the field name is entirely CJK', () => {
    const e = new CalcError('mustBePositive', { name: 'volume', value: 0 });
    expect(errorMessage(e, t)).toBe('体积必须大于 0（当前为 0）');
  });

  it('should not double up when the template already has a space', () => {
    const e = new CalcError('mustBePositive', { name: 'pka', value: 0 });
    expect(errorMessage(e, t)).toBe('pKa必须大于 0（当前为 0）'.replace('pKa必须', 'pKa 必须'));
    expect(errorMessage(e, t)).not.toContain('  ');
  });

  it('should fall back to the raw message for a non-CalcError', () => {
    expect(errorMessage(new Error('boom'), t)).toBe('boom');
  });

  it('should return an empty string for a missing error', () => {
    expect(errorMessage(null, t)).toBe('');
  });
});
