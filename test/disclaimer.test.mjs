import { describe, it, expect } from 'vitest';
import {
  ACK_KEY,
  hasAcknowledged,
  acknowledge,
  resetAcknowledgement,
  DISCLAIMER_POINTS,
} from '../src/ui/disclaimer.mjs';
import { zh } from '../src/ui/locales/zh.mjs';
import { en } from '../src/ui/locales/en.mjs';

const store = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

describe('acknowledgement state', () => {
  it('should start unacknowledged', () => {
    expect(hasAcknowledged(store())).toBe(false);
  });

  it('should record an acknowledgement', () => {
    const s = store();
    acknowledge(s);
    expect(hasAcknowledged(s)).toBe(true);
  });

  it('should survive a fresh read, so the notice is not shown every visit', () => {
    const s = store();
    acknowledge(s);
    expect(hasAcknowledged(s)).toBe(true);
    expect(hasAcknowledged(s)).toBe(true);
  });

  it('should be resettable, so the notice can be re-read from the about panel', () => {
    const s = store();
    acknowledge(s);
    resetAcknowledgement(s);
    expect(hasAcknowledged(s)).toBe(false);
  });

  it('should treat storage failure as unacknowledged rather than crashing', () => {
    // Safari private mode throws on write. Showing the notice again is the safe
    // direction to fail: the user re-reads a warning rather than missing it.
    const hostile = {
      getItem: () => { throw new Error('nope'); },
      setItem: () => { throw new Error('nope'); },
      removeItem: () => {},
    };
    expect(hasAcknowledged(hostile)).toBe(false);
    expect(() => acknowledge(hostile)).not.toThrow();
    expect(() => resetAcknowledgement(hostile)).not.toThrow();
  });

  it('should use a versioned key so the notice can be re-shown after a change', () => {
    expect(ACK_KEY).toMatch(/\.v\d+$/);
  });
});

describe('disclaimer content', () => {
  it('should state the educational-use limit', () => {
    const all = DISCLAIMER_POINTS.flatMap((p) => [p.zh, p.en]).join(' ').toLowerCase();
    expect(all).toMatch(/教学|educational|teaching/);
  });

  it('should warn against clinical, diagnostic or production use', () => {
    const all = DISCLAIMER_POINTS.flatMap((p) => [p.zh, p.en]).join(' ').toLowerCase();
    expect(all).toMatch(/临床|clinical/);
    expect(all).toMatch(/诊断|diagnostic/);
  });

  it('should tell the user to verify results independently', () => {
    const all = DISCLAIMER_POINTS.flatMap((p) => [p.zh, p.en]).join(' ').toLowerCase();
    expect(all).toMatch(/核对|验证|verify|check/);
  });

  it('should be honest that the model is simplified rather than claiming precision', () => {
    const all = DISCLAIMER_POINTS.flatMap((p) => [p.zh, p.en]).join(' ').toLowerCase();
    expect(all).toMatch(/简化|近似|simplif|approximat|ideal/);
  });

  it('should name what is not modelled, not just wave at "limitations"', () => {
    const all = DISCLAIMER_POINTS.flatMap((p) => [p.zh, p.en]).join(' ').toLowerCase();
    expect(all).toMatch(/活度|activity/);
    expect(all).toMatch(/温度|temperature/);
  });

  it('should have both languages for every point', () => {
    for (const p of DISCLAIMER_POINTS) {
      expect(p.zh?.trim(), 'zh missing').toBeTruthy();
      expect(p.en?.trim(), 'en missing').toBeTruthy();
    }
  });

  it('should have a heading and a body for every point', () => {
    for (const p of DISCLAIMER_POINTS) {
      expect(p.titleZh?.trim()).toBeTruthy();
      expect(p.titleEn?.trim()).toBeTruthy();
    }
  });

  it('should not be a single throwaway line', () => {
    // A one-liner in a footer is not a disclaimer, it is decoration.
    expect(DISCLAIMER_POINTS.length).toBeGreaterThanOrEqual(3);
  });

  it('should avoid claiming the software is accurate for real use', () => {
    const all = DISCLAIMER_POINTS.flatMap((p) => [p.zh, p.en]).join(' ').toLowerCase();
    expect(all).not.toMatch(/临床可用|approved for clinical|guaranteed accurate/);
  });
});

describe('disclaimer locale keys', () => {
  it('should define the disclaimer strings in both dictionaries', () => {
    for (const dict of [zh, en]) {
      expect(dict.disclaimer?.title).toBeTruthy();
      expect(dict.disclaimer?.ack).toBeTruthy();
      expect(dict.disclaimer?.footer).toBeTruthy();
    }
  });
});
