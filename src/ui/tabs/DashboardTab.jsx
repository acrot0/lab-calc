import React, { useEffect, useMemo, useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import Card from '../components/Card.jsx';
import { recordSummary } from '../summaries.mjs';
import { loadInventory, sortForDisplay, expiryStatus, daysLeft } from '../inventory.mjs';
import { loadTimers, formatRemaining } from '../timers.mjs';

/**
 * The home screen: what is happening, in the order a returning user asks it.
 *
 * Three questions, three blocks — what did I last calculate, which bottles
 * need attention, what is still counting down. Every block reads data another
 * tab owns (history via props, shelf and timers via their storage keys) and
 * every row links to the tab where the thing can be acted on. The dashboard
 * itself owns nothing, which is why it holds no state of its own beyond the
 * storage reads it refreshes on mount.
 */
export default function DashboardTab({ entries = [], onReplay, onGoTo }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [inventory, setInventory] = useState([]);
  const [timers, setTimers] = useState([]);

  const store = typeof localStorage !== 'undefined' ? localStorage : null;
  useEffect(() => {
    setInventory(loadInventory(store));
    setTimers(loadTimers(store, Date.now()));
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [store]);

  const recent = useMemo(() => entries.slice(0, 5), [entries]);
  const shelfWarnings = useMemo(
    () => sortForDisplay(inventory.filter(
      (x) => ['expired', 'expiring'].includes(expiryStatus(x, now)),
    ), now).slice(0, 5),
    // Recomputed per tick so an expiring bottle crosses the line on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, store],
  );
  const running = useMemo(
    () => timers.filter((x) => x.endAt > now).slice(0, 4),
    [timers, now],
  );

  function ago(iso) {
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms) || ms < 0) return '';
    const min = Math.floor(ms / 60000);
    if (min < 1) return t('dash.justNow');
    if (min < 60) return t('dash.minAgo', { n: min });
    const h = Math.floor(min / 60);
    if (h < 24) return t('dash.hourAgo', { n: h });
    return t('dash.dayAgo', { n: Math.floor(h / 24) });
  }

  return (
    <Card>
      <section className="dash-block">
        <h2>
          <Icons.history size={ICON_SIZE.inline} aria-hidden="true" />
          {t('dash.recent')}
        </h2>
        {recent.length === 0 ? (
          <p className="dash-empty">{t('dash.recentEmpty')}</p>
        ) : (
          <ul className="dash-list">
            {recent.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="dash-row"
                  onClick={() => onReplay?.(e)}
                  title={t('history.replay')}
                >
                  <span className="dash-main">{recordSummary(e, t)}</span>
                  <span className="dash-aside">{ago(e.at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dash-block">
        <h2>
          <Icons.beaker size={ICON_SIZE.inline} aria-hidden="true" />
          {t('dash.shelf')}
        </h2>
        {shelfWarnings.length === 0 ? (
          <p className="dash-empty">{t('dash.shelfOk')}</p>
        ) : (
          <ul className="dash-list">
            {shelfWarnings.map((item) => {
              const status = expiryStatus(item, now);
              const d = daysLeft(item.expiry, now);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`dash-row is-${status}`}
                    onClick={() => onGoTo?.('inventory')}
                  >
                    <span className="dash-main">{item.name}</span>
                    <span className="dash-aside">
                      {status === 'expired'
                        ? t('inv.expired')
                        : t('inv.expiring', { n: Math.max(d ?? 0, 0) })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dash-block">
        <h2>
          <Icons.timers size={ICON_SIZE.inline} aria-hidden="true" />
          {t('dash.timers')}
        </h2>
        {running.length === 0 ? (
          <p className="dash-empty">{t('dash.timersEmpty')}</p>
        ) : (
          <ul className="dash-list">
            {running.map((timer) => {
              const left = timer.endAt - now;
              return (
                <li key={timer.id}>
                  <button
                    type="button"
                    className={`dash-row${left <= 0 ? ' is-expired' : ''}`}
                    onClick={() => onGoTo?.('timers')}
                  >
                    <span className="dash-main">{timer.label}</span>
                    <span className="dash-aside">
                      {left <= 0
                        ? t('timers.overdue', { time: formatRemaining(-left) })
                        : formatRemaining(left)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Card>
  );
}
