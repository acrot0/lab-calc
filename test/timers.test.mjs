import { describe, it, expect } from 'vitest';
import {
  parseDuration, formatRemaining, loadTimers, saveTimers,
  addTimer, removeTimer, nextDue, sortTimers,
  memoryStore, TIMERS_KEY, MAX_TIMERS,
} from '../src/ui/timers.mjs';

const NOW = 1_800_000_000_000;

describe('parseDuration', () => {
  it('should treat a bare number as minutes', () => {
    expect(parseDuration('10')).toBe(600000);
    expect(parseDuration('1.5')).toBe(90000);
  });

  it('should read h/m/s units case-insensitively', () => {
    expect(parseDuration('90s')).toBe(90000);
    expect(parseDuration('90S')).toBe(90000);
    expect(parseDuration('5m')).toBe(300000);
    expect(parseDuration('5min')).toBe(300000);
    expect(parseDuration('2h')).toBe(7200000);
    expect(parseDuration('2 hours')).toBe(7200000);
  });

  it('should refuse junk, zero and negatives', () => {
    for (const bad of ['', '  ', 'abc', '10x', '0', '-5', '1h30']) expect(parseDuration(bad)).toBeNull();
  });
});

describe('formatRemaining', () => {
  it('should format as m:ss, then h:mm:ss', () => {
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(59999)).toBe('0:59');
    expect(formatRemaining(60000)).toBe('1:00');
    expect(formatRemaining(3723000)).toBe('1:02:03');
  });

  it('should never go negative', () => {
    expect(formatRemaining(-5000)).toBe('0:00');
  });
});

describe('addTimer / removeTimer', () => {
  it('should compute the end time from now', () => {
    const [t] = addTimer([], { label: 'x', ms: 60000 }, NOW);
    expect(t.endAt).toBe(NOW + 60000);
    expect(t.totalMs).toBe(60000);
  });

  it('should sort by urgency and cap the list', () => {
    let list = addTimer([], { label: 'a', ms: 10 * 60000 }, NOW);
    list = addTimer(list, { label: 'b', ms: 5 * 60000 }, NOW);
    expect(list.map((x) => x.label)).toEqual(['b', 'a']);
    for (let i = 0; i < MAX_TIMERS + 3; i += 1) {
      list = addTimer(list, { label: `t${i}`, ms: 60000 }, NOW + i);
    }
    expect(list.length).toBeLessThanOrEqual(MAX_TIMERS);
  });

  it('should default the label rather than store an empty one', () => {
    expect(addTimer([], { label: '   ', ms: 1000 }, NOW)[0].label).toBe('timer');
  });

  it('should refuse a non-positive duration unchanged', () => {
    const list = addTimer([], { label: 'a', ms: 60000 }, NOW);
    expect(addTimer(list, { label: 'b', ms: 0 }, NOW)).toBe(list);
  });

  it('should remove only the named timer', () => {
    const [a] = addTimer([], { label: 'a', ms: 60000 }, NOW);
    const [b] = addTimer([a], { label: 'b', ms: 60000 }, NOW);
    expect(removeTimer([a, b], b.id)).toEqual([a]);
  });
});

describe('due and ordering', () => {
  it('should name the most overdue timer, or null when none has ended', () => {
    const a = addTimer([], { label: 'a', ms: 60000 }, NOW - 120000)[0];
    const b = addTimer([], { label: 'b', ms: 60000 }, NOW - 60000)[0];
    expect(nextDue([a, b], NOW).label).toBe('a');
    // Still present while overdue; gone only once removed.
    expect(nextDue([b], NOW + 300000)?.label).toBe('b');
    expect(nextDue([b], NOW - 120000)).toBeNull();
    expect(nextDue([], NOW)).toBeNull();
  });

  it('should show due timers first, most overdue first', () => {
    const past = addTimer([], { label: 'past', ms: 60000 }, NOW - 120000)[0];
    const soon = addTimer([], { label: 'soon', ms: 60000 }, NOW)[0];
    expect(sortTimers([soon, past], NOW).map((x) => x.label)).toEqual(['past', 'soon']);
  });
});

describe('persistence', () => {
  it('should round-trip running timers and drop finished ones on load', () => {
    const s = memoryStore();
    const running = addTimer([], { label: 'r', ms: 60000 }, NOW);
    const finished = addTimer([], { label: 'f', ms: 1000 }, NOW - 5000);
    expect(saveTimers(s, [running[0], finished[0]])).toBe(true);
    expect(loadTimers(s, NOW)).toEqual(running);
  });

  it('should survive a corrupt store and a refused write', () => {
    expect(loadTimers(memoryStore({ [TIMERS_KEY]: 'nope' }))).toEqual([]);
    expect(loadTimers(memoryStore({ [TIMERS_KEY]: '{}' }))).toEqual([]);
    const hostile = { getItem: () => null, setItem: () => { throw new Error('x'); }, removeItem: () => {} };
    expect(saveTimers(hostile, [])).toBe(false);
  });
});
