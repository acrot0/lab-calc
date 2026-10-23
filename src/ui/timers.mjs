/**
 * The bench timers.
 *
 * ## Why countdown timers and not a stopwatch
 *
 * A bench protocol says "10 minutes at 65 °C", not "start counting and stop
 * when it looks done". The timer that answers that is a countdown with a
 * name, and the thing it names is the step: "block in shaker". Multiple
 * countdowns run side by side because benches do — a gel runs while the
 * blotting buffer thaws.
 *
 * ## Why the remaining time is derived, not ticked
 *
 * `remainingMs` is computed from `endAt - now` on every render rather than
 * decremented by an interval. A ticking counter drifts when the tab sleeps,
 * and a lab timer that says 2 minutes after 15 have passed is worse than no
 * timer — the experiment is already wrong and the app is vouching for it.
 * Deriving from wall-clock end times also makes the timer survive a reload:
 * `endAt` is stored, so a timer started before a page refresh is still right.
 */

export const TIMERS_KEY = 'lab-calc.timers.v1';
export const MAX_TIMERS = 12;

/** Under a minute reads as seconds; the floor keeps 0 meaning "just ended". */
export function formatRemaining(ms) {
  if (!Number.isFinite(ms)) return '';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Whole minutes and seconds from a free-text shorthand like "90s" or "1h30". */
export function parseDuration(text) {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return null;
  // Pure number means minutes: that is how protocols are spoken.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const mins = Number(s);
    return mins > 0 ? Math.round(mins * 60000) : null;
  }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hours?|m|min|minutes?|s|sec|seconds?)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  const unit = m[2][0];
  if (unit === 'h') return Math.round(n * 3600000);
  if (unit === 'm') return Math.round(n * 60000);
  return Math.round(n * 1000);
}

/** The shared probe-based store resolution. */
export function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

export function resolveStore(candidate) {
  try {
    const s = candidate ?? globalThis.localStorage;
    if (!s) return memoryStore();
    const probe = '__labcalc_timer_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return memoryStore();
  }
}

let seq = 0;
function newId(now) {
  seq = (seq + 1) % 1000;
  return `tmr-${now.getTime().toString(36)}-${seq.toString(36)}`;
}

const cleanLabel = (s) => String(s ?? '').trim().slice(0, 60) || 'timer';

function normalise(t, now) {
  if (!t || typeof t !== 'object') return null;
  const endAt = Number(t.endAt);
  if (!Number.isFinite(endAt) || endAt <= 0) return null;
  return {
    id: typeof t.id === 'string' && t.id ? t.id : newId(new Date(now)),
    label: cleanLabel(t.label),
    endAt,
    totalMs: Number.isFinite(Number(t.totalMs)) && Number(t.totalMs) > 0
      ? Math.round(Number(t.totalMs))
      : Math.max(60000, endAt - now),
  };
}

/** Load stored timers, dropping finished and malformed ones. */
export function loadTimers(store, now = Date.now()) {
  let raw = null;
  try { raw = store?.getItem(TIMERS_KEY); } catch { raw = null; }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => normalise(t, now))
      .filter((t) => t && t.endAt > now)
      .slice(0, MAX_TIMERS);
  } catch {
    return [];
  }
}

/** Persist; false when the store refuses, the same contract as the history. */
export function saveTimers(store, timers) {
  try {
    store?.setItem(TIMERS_KEY, JSON.stringify(timers ?? []));
    return true;
  } catch {
    return false;
  }
}

/** Add a countdown. Ends past-first so the most urgent is the easiest to see. */
export function addTimer(timers, { label, ms }, now = Date.now()) {
  const duration = Math.round(Number(ms));
  if (!Number.isFinite(duration) || duration <= 0) return timers ?? [];
  const timer = {
    id: newId(new Date(now)),
    label: cleanLabel(label),
    endAt: now + duration,
    totalMs: duration,
  };
  return [timer, ...(timers ?? [])]
    .sort((a, b) => a.endAt - b.endAt)
    .slice(0, MAX_TIMERS);
}

/** Remove one timer by id. */
export function removeTimer(timers, id) {
  return (timers ?? []).filter((t) => t && t.id !== id);
}

/** The soonest timer that has ended, or null — the alarm rings one at a time. */
export function nextDue(timers, now = Date.now()) {
  const due = (timers ?? []).filter((t) => t && t.endAt <= now);
  if (due.length === 0) return null;
  return due.reduce((a, b) => (a.endAt <= b.endAt ? a : b));
}

/** Sort for display: due first (most overdue first), then by end time. */
export function sortTimers(timers, now = Date.now()) {
  return [...(timers ?? [])].sort((a, b) => {
    const aDue = a.endAt <= now;
    const bDue = b.endAt <= now;
    if (aDue !== bDue) return aDue ? -1 : 1;
    return a.endAt - b.endAt;
  });
}
