import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import Card from '../components/Card.jsx';
import {
  loadTimers, addTimer, removeTimer,
  parseDuration, formatRemaining, sortTimers, nextDue,
} from '../timers.mjs';
import { saveTimersLive } from '../use-storage-value.mjs';

/**
 * The bench timer board.
 *
 * Named countdowns, several at once, derived from wall-clock end times so a
 * sleeping tab or a reload cannot make them lie. When one ends the board says
 * so, keeps counting up in red (how long ago matters at the bench), and plays
 * a short chime — created with oscillators rather than an audio file, so
 * there is nothing to download and nothing to cache.
 */
export default function TimersTab() {
  const { t } = useI18n();
  const [label, setLabel] = useState('');
  const [duration, setDuration] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [timers, setTimers] = useState(() => loadTimers(
    typeof localStorage !== 'undefined' ? localStorage : null,
  ));
  const [acknowledged, setAcknowledged] = useState(new Set());
  const [saveFailed, setSaveFailed] = useState(false);
  const audioRef = useRef(null);

  const write = (next) => {
    setTimers(next);
    setSaveFailed(!saveTimersLive(
      typeof localStorage !== 'undefined' ? localStorage : null,
      next,
    ));
  };

  // One 1s tick for the whole board. Each timer's display derives from `now`,
  // so the tick does not touch timer state — only the shared clock.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const due = useMemo(() => nextDue(timers, now), [timers, now]);
  const shown = useMemo(() => sortTimers(timers, now), [timers, now]);

  /*
   * Warm the AudioContext on the Start press — a genuine user gesture.
   *
   * Chrome's autoplay policy keeps a context created outside a gesture
   * suspended, and `resume()` only reliably works from inside one. Waiting
   * until the alarm fires is too late: by then the last gesture may be long
   * past, and a `resume()` that does not take effect means a silent alarm —
   * the one chime the tab exists to play. Creating (or resuming) the context
   * inside the click that starts the timer means the alarm's oscillators run
   * on a live context no matter when the countdown ends.
   */
  function primeAudio() {
    try {
      const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctx) return;
      audioRef.current ??= new Ctx();
      if (audioRef.current.state === 'suspended') audioRef.current.resume();
    } catch {
      /* No audio is a degraded alarm, not a failed timer. */
    }
  }

  /*
   * The chime, once per timer. `acknowledged` holds ids already played so a
   * re-render (or a new timer becoming due) does not replay an old alarm.
   * The AudioContext is created on first use inside the effect rather than at
   * module scope: a context created before a user gesture stays suspended and
   * the first alarm is silent — the one alarm that mattered.
   */
  useEffect(() => {
    if (!due || acknowledged.has(due.id)) return;
    try {
      const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctx) return;
      audioRef.current ??= new Ctx();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const start = ctx.currentTime;
      for (let i = 0; i < 3; i += 1) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, start + i * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.3, start + i * 0.3 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.3 + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start + i * 0.3);
        osc.stop(start + i * 0.3 + 0.2);
      }
    } catch {
      /* No audio is a degraded alarm, not a failed timer. */
    }
    if (typeof document !== 'undefined' && due) {
      document.title = `⏰ ${due.label} — Lab Calc`;
    }
    setAcknowledged((prev) => new Set(prev).add(due.id));
  }, [due, acknowledged]);

  // Restore the plain title once nothing is due.
  useEffect(() => {
    if (due || typeof document === 'undefined') return;
    if (document.title.startsWith('⏰')) document.title = t('doc.title');
  }, [due]);

  function submit(e) {
    e.preventDefault();
    const ms = parseDuration(duration);
    if (ms === null) return;
    primeAudio();
    write(addTimer(timers, { label, ms }));
    setLabel('');
    setDuration('');
  }

  return (
    <Card>
      <form className="timer-form" onSubmit={submit}>
        <label>
          <span>{t('timers.label')}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('timers.labelHint')}
            aria-label={t('timers.label')}
          />
        </label>
        <label>
          <span>{t('timers.duration')}</span>
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder={t('timers.durationHint')}
            aria-label={t('timers.duration')}
            aria-invalid={duration.trim() !== '' && parseDuration(duration) === null}
          />
        </label>
        <button type="submit" className="primary">
          <Icons.add size={ICON_SIZE.control} aria-hidden="true" />
          {t('timers.start')}
        </button>
      </form>
      {duration.trim() !== '' && parseDuration(duration) === null && (
        <div className="msg err timer-parse">{t('timers.parseErr')}</div>
      )}
      {saveFailed && <div className="msg err" role="alert">{t('timers.saveFailed')}</div>}

      {timers.length === 0 ? (
        <div className="timer-empty" role="status">{t('timers.empty')}</div>
      ) : (
        <ul className="timer-list">
          {shown.map((timer) => {
            const left = timer.endAt - now;
            const isDue = left <= 0;
            return (
              <li key={timer.id} className={`timer-item${isDue ? ' is-due' : ''}`}>
                <div className="timer-body">
                  <strong className="timer-label">{timer.label}</strong>
                  {/*
                   * role=timer is silent by default (aria-live off): a
                   * per-second announcement would drown everything else. When
                   * a timer ends the span becomes an assertive alert for one
                   * render, so the moment is announced exactly once and the
                   * counting-up that follows stays quiet.
                   */}
                  <span
                    className="timer-time"
                    role={isDue ? 'alert' : 'timer'}
                    aria-live={isDue ? 'assertive' : 'off'}
                  >
                    {isDue
                      ? t('timers.overdue', { time: formatRemaining(-left) })
                      : formatRemaining(left)}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  title={t('timers.stop')}
                  aria-label={`${t('timers.stop')}: ${timer.label}`}
                  onClick={() => {
                    write(removeTimer(timers, timer.id));
                    setAcknowledged((prev) => {
                      const next = new Set(prev);
                      next.delete(timer.id);
                      return next;
                    });
                  }}
                >
                  <Icons.close size={ICON_SIZE.inline} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
