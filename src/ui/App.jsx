import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Icons, ICON_SIZE } from './icons.jsx';
import {
  resolveStore, loadHistory, saveHistory, addEntry, removeEntry, clearHistory, planReplay, MAX_ENTRIES,
} from './history.mjs';
import { mergeEntries } from './export.mjs';
import { hasAcknowledged, acknowledge } from './disclaimer.mjs';
import { useI18n } from './LocaleContext.jsx';
import { useTheme, ThemeToggle } from './ThemeContext.jsx';
import { LOCALES } from './i18n.mjs';
import WeighTab from './tabs/WeighTab.jsx';
import DiluteTab from './tabs/DiluteTab.jsx';
import BufferTab from './tabs/BufferTab.jsx';
import SeriesTab from './tabs/SeriesTab.jsx';
import ConvertTab from './tabs/ConvertTab.jsx';
import PhTab from './tabs/PhTab.jsx';
import PercentTab from './tabs/PercentTab.jsx';
import CurveTab from './tabs/CurveTab.jsx';
import ReagentTab from './tabs/ReagentTab.jsx';
import SpectroTab from './tabs/SpectroTab.jsx';
import LabTab from './tabs/LabTab.jsx';
import ColligativeTab from './tabs/ColligativeTab.jsx';
import ReactionTab from './tabs/ReactionTab.jsx';
import ElectroTab from './tabs/ElectroTab.jsx';
import ElementsTab from './tabs/ElementsTab.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import NoticeModal from './components/NoticeModal.jsx';

/**
 * Every tab has its own icon. "Dilute" and "Serial dilution" shared one
 * (Droplets) until the icon set was consolidated — two entries that look
 * identical in a navigation bar are not navigation.
 */
const TABS = [
  { id: 'weigh', icon: Icons.weigh, Component: WeighTab },
  { id: 'dilute', icon: Icons.dilute, Component: DiluteTab },
  { id: 'buffer', icon: Icons.buffer, Component: BufferTab },
  { id: 'series', icon: Icons.series, Component: SeriesTab },
  { id: 'ph', icon: Icons.ph, Component: PhTab },
  { id: 'percent', icon: Icons.percent, Component: PercentTab },
  { id: 'curve', icon: Icons.curve, Component: CurveTab },
  { id: 'reagent', icon: Icons.reagent, Component: ReagentTab },
  { id: 'spectro', icon: Icons.spectro, Component: SpectroTab },
  { id: 'lab', icon: Icons.lab, Component: LabTab },
  { id: 'colligative', icon: Icons.colligative, Component: ColligativeTab },
  { id: 'reaction', icon: Icons.reaction, Component: ReactionTab },
  { id: 'electro', icon: Icons.electro, Component: ElectroTab },
  { id: 'elements', icon: Icons.elements, Component: ElementsTab },
  { id: 'convert', icon: Icons.convert, Component: ConvertTab },
];

function LocaleSelect() {
  const { locale, setLocale, t } = useI18n();
  return (
    <span className="control-group">
      <Icons.language size={ICON_SIZE.inline} aria-hidden="true" />
      <label className="sr-only" htmlFor="locale-select">{t('app.langLabel')}</label>
      <select
        id="locale-select"
        className="control"
        value={locale}
        onChange={(e) => setLocale(e.target.value)}
      >
        {Object.entries(LOCALES).map(([code, name]) => (
          <option key={code} value={code}>{name}</option>
        ))}
      </select>
    </span>
  );
}

/**
 * Which tab to open on load.
 *
 * The manifest's `shortcuts` link to `?tab=...`, so the value arrives from
 * outside the app. Anything unrecognised falls back to the default rather than
 * being trusted — an unknown id would leave the view blank, and a shortcut is
 * exactly the kind of thing that goes stale when a tab is renamed.
 */
function initialTab() {
  try {
    const want = new URLSearchParams(globalThis.location?.search ?? '').get('tab');
    return TABS.some((x) => x.id === want) ? want : 'weigh';
  } catch {
    return 'weigh';
  }
}

export default function App() {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const [tab, setTab] = useState(initialTab);
  const [entries, setEntries] = useState([]);
  const [restored, setRestored] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [ackd, setAckd] = useState(true);
  const store = useMemo(() => resolveStore(), []);

  useEffect(() => { setEntries(loadHistory(store)); }, [store]);
  useEffect(() => { saveHistory(store, entries); }, [store, entries]);

  // Show the notice on first visit. Deferred to an effect rather than initial
  // state so it never flashes for a returning user.
  useEffect(() => {
    const acked = hasAcknowledged(store);
    setAckd(acked);
    if (!acked) setNoticeOpen(true);
  }, [store]);

  const record = useCallback((entry) => setEntries((prev) => addEntry(prev, entry)), []);
  const remove = useCallback((id) => setEntries((prev) => removeEntry(prev, id)), []);
  const clear = useCallback(() => setEntries(clearHistory()), []);

  // Import merges rather than replaces: a backup is usually one machine's
  // history being added to another's, and overwriting would destroy work the
  // user never agreed to lose.
  const importEntries = useCallback((incoming) => {
    setEntries((prev) => mergeEntries(prev, incoming, MAX_ENTRIES));
  }, []);

  const replay = useCallback((entry) => {
    const plan = planReplay(entry);
    if (!plan) return;
    setTab(plan.tab);
    setRestored(plan.inputs);
    setNonce((k) => k + 1);
  }, []);

  const acceptNotice = useCallback(() => {
    acknowledge(store);
    setAckd(true);
    setNoticeOpen(false);
  }, [store]);

  const active = TABS.find((x) => x.id === tab) ?? TABS[0];
  const ActiveTab = active.Component;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Icons.weigh size={ICON_SIZE.display} /></span>
          <div className="brand-text">
            <h1>{t('app.title')}</h1>
            <p className="brand-sub">{t('app.tagline')}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <LocaleSelect />
          <ThemeToggle />
        </div>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            className="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={ICON_SIZE.control} aria-hidden="true" />
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      {/* The tab panel is the page's main content; the topbar and footer are
          chrome around it. Without this landmark a screen reader can only jump
          by heading, and every tab change re-announces the whole page. */}
      <main className={`split${active.id === 'elements' ? ' is-wide' : ''}`}>
        <div>
          <ActiveTab key={nonce} onRecord={record} restored={restored} theme={resolved} />
        </div>
        <HistoryPanel entries={entries} onRemove={remove} onReplay={replay} onClear={clear}
          onImport={importEntries} />
      </main>

      <footer className="footer">
        <Icons.notice size={ICON_SIZE.inline} aria-hidden="true" />
        <span>{t('disclaimer.footer')}</span>
        <span className="sep">·</span>
        <button className="link-btn" onClick={() => setNoticeOpen(true)}>
          {t('disclaimer.footerLink')}
        </button>
        <span className="grow" />
        <span>{t('app.footerVersion')}</span>
      </footer>

      <NoticeModal
        open={noticeOpen}
        mustAcknowledge={!ackd}
        onAcknowledge={acceptNotice}
        onClose={() => setNoticeOpen(false)}
      />
    </div>
  );
}
