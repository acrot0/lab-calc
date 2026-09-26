import React, { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Icons, ICON_SIZE } from './icons.jsx';
import {
  resolveStore, loadHistory, saveHistory, addEntry, removeEntry, clearHistory, planReplay, MAX_ENTRIES,
} from './history.mjs';
import { mergeEntries } from './export.mjs';
import { hasAcknowledged, acknowledge } from './disclaimer.mjs';
import { useI18n } from './LocaleContext.jsx';
import { useTheme } from './ThemeContext.jsx';
import SettingsMenu from './components/SettingsMenu.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import NoticeModal from './components/NoticeModal.jsx';
import NavRail from './components/NavRail.jsx';
import MobileNav from './components/MobileNav.jsx';
import BrandMark from './components/BrandMark.jsx';
import CalculatorDrawer from './components/CalculatorDrawer.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import { installBackNav } from './back-nav.mjs';
import {
  cycleTab, isTyping, matchShortcut, shouldIgnore, worksWhileTyping,
} from './shortcuts.mjs';

/*
 * Tabs are loaded on demand.
 *
 * All sixteen used to be static imports, so the first screen downloaded and
 * parsed every tab's code before it could draw — including the periodic table
 * with its SMILES renderer and the two canvas-chart tabs. On a phone that is
 * the difference between a calculator that opens and one that does not.
 *
 * The default tab is still fetched immediately, but as its own chunk rather
 * than as part of a 750 KB bundle. React's Suspense boundary shows the spinner
 * while a chunk arrives; a cached chunk arrives in the same frame, so the
 * fallback is only ever seen on a cold, slow load.
 */
const WeighTab = lazy(() => import('./tabs/WeighTab.jsx'));
const DiluteTab = lazy(() => import('./tabs/DiluteTab.jsx'));
const BufferTab = lazy(() => import('./tabs/BufferTab.jsx'));
const SeriesTab = lazy(() => import('./tabs/SeriesTab.jsx'));
const ConvertTab = lazy(() => import('./tabs/ConvertTab.jsx'));
const PhTab = lazy(() => import('./tabs/PhTab.jsx'));
const PercentTab = lazy(() => import('./tabs/PercentTab.jsx'));
const CurveTab = lazy(() => import('./tabs/CurveTab.jsx'));
const ReagentTab = lazy(() => import('./tabs/ReagentTab.jsx'));
const SpectroTab = lazy(() => import('./tabs/SpectroTab.jsx'));
const LabTab = lazy(() => import('./tabs/LabTab.jsx'));
const ColligativeTab = lazy(() => import('./tabs/ColligativeTab.jsx'));
const BioTab = lazy(() => import('./tabs/BioTab.jsx'));
const ReactionTab = lazy(() => import('./tabs/ReactionTab.jsx'));
const ElectroTab = lazy(() => import('./tabs/ElectroTab.jsx'));
const ElementsTab = lazy(() => import('./tabs/ElementsTab.jsx'));

/**
 * What shows while a tab's chunk is in flight.
 *
 * Deliberately a quiet placeholder rather than a spinner: the chunk is usually
 * cached and arrives within a frame, so a spinner would flash and read as a
 * glitch. It keeps the card's shape so nothing jumps when the real content
 * lands.
 *
 * The label is announced, so a screen-reader user knows what is loading rather
 * than meeting silence.
 */
function CardSkeleton({ label }) {
  return (
    <div className="card is-loading" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="skeleton-row" />
      <div className="skeleton-row" />
      <div className="skeleton-row is-short" />
    </div>
  );
}

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
  { id: 'bio', icon: Icons.dna, Component: BioTab },
  { id: 'reaction', icon: Icons.reaction, Component: ReactionTab },
  { id: 'electro', icon: Icons.electro, Component: ElectroTab },
  { id: 'elements', icon: Icons.elements, Component: ElementsTab },
  { id: 'convert', icon: Icons.convert, Component: ConvertTab },
];

/** The tab ids, in order — what the arrow shortcuts cycle through. */
const TAB_IDS = TABS.map((t) => t.id);

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
  const [calcOpen, setCalcOpen] = useState(false);
  // Lifted out of `SettingsMenu` so the `?` shortcut can open it. The menu owns
  // its own outside-click and Escape handling; it just no longer owns whether
  // it is open.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const store = useMemo(() => resolveStore(), []);

  /*
   * The keyboard shortcuts.
   *
   * Bound on the window rather than on a focused element, because the point of
   * most of them is reaching something without leaving the field you are in.
   *
   * Two rules the handler follows, and both are what a naive global handler
   * gets wrong. Nothing fires while the user is typing — a `2` that switched
   * tabs because it is a shortcut would make the app unusable, and the check is
   * in `shouldIgnore`. And `preventDefault` is called only when a shortcut
   * actually matched, so the browser keeps its own find, its address bar and
   * its tab keys.
   *
   * The matching is in `shortcuts.mjs` so the list the settings popover shows
   * and the list this acts on cannot drift.
   */
  useEffect(() => {
    const onKey = (e) => {
      if (shouldIgnore(e)) return;
      const action = matchShortcut(e);
      if (!action) return;
      // Suppressed only for the shortcuts that would otherwise eat a keystroke
      // the field needs. `Ctrl+K` is not one of them — the calculator focuses
      // its own entry when it opens, so suppressing it there is what made the
      // window impossible to close from the keyboard. See `shortcuts.mjs`.
      if (isTyping(document.activeElement) && !worksWhileTyping(action)) return;
      e.preventDefault();
      switch (action) {
        case 'calc': setCalcOpen((v) => !v); break;
        case 'nextTab': setTab((t) => cycleTab(TAB_IDS, t, 1)); break;
        case 'prevTab': setTab((t) => cycleTab(TAB_IDS, t, -1)); break;
        // Move the focus into the tab's own content, so a keyboard user lands
        // on the form rather than having to tab through the whole navigation.
        case 'focusWork': document.querySelector('.work input, .work select, .work button')?.focus(); break;
        // The shortcut list lives in the settings popover, so `?` opens that
        // rather than a help screen of its own — the list and the thing it
        // describes are then the same panel.
        case 'help': setSettingsOpen((v) => !v); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
   * The system back gesture closes the topmost layer instead of the app.
   *
   * Installed as a PWA there is no browser back button, so the gesture is the
   * only way back — and with no history of our own it exits the app, taking
   * whatever was typed into the form with it.
   *
   * The installer is mounted once and reads the open flags through a ref. It
   * must not be re-created per render: it owns the count of history entries it
   * pushed, and a fresh instance would forget them and push duplicates. The
   * flags are then re-synced from their own effect, which is the only thing
   * that needs to react to them changing.
   *
   * The notice only counts as dismissible once it has been acknowledged. On a
   * first visit it is the mandatory disclaimer, and a back gesture that
   * dismissed it would be a way to skip the one thing it exists to make sure
   * was read.
   */
  const openRef = useRef({});
  openRef.current = { notice: noticeOpen && ackd, calc: calcOpen };
  const backNavRef = useRef(null);
  useEffect(() => {
    const nav = installBackNav({
      win: globalThis,
      getOpen: () => openRef.current,
      close: (layer) => {
        if (layer === 'notice') setNoticeOpen(false);
        else if (layer === 'calc') setCalcOpen(false);
      },
    });
    backNavRef.current = nav;
    return () => { nav.stop(); backNavRef.current = null; };
  }, []);

  useEffect(() => { backNavRef.current?.resync(); }, [noticeOpen, calcOpen, ackd]);

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
          <BrandMark size={30} />
          <div className="brand-text">
            <h1>{t('app.title')}</h1>
            <p className="brand-sub">{t('app.tagline')}</p>
          </div>
        </div>
        <div className="topbar-actions">
          {/* A visible affordance for a keyboard-only feature: the shortcut is
              the fast path, and this is how anyone finds out it exists. */}
          <button
            type="button"
            className="control"
            onClick={() => setCalcOpen((v) => !v)}
            aria-expanded={calcOpen}
            title={`${t('convert.calcOpen')} (Ctrl+K)`}
          >
            <Icons.calc size={ICON_SIZE.control} aria-hidden="true" />
            <span className="control-label">{t('convert.calcOpen')}</span>
          </button>
          <SettingsMenu open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
      </header>

      {/* Two navigations, one shown at a time by a media query. The rail is the
          desktop shape — sixteen tabs fit down a column but not across a row —
          and the bottom bar is the phone shape, where a thumb expects it.

          Both are rendered because CSS decides which is visible; hiding one in
          JavaScript would mean measuring the viewport in React, which is how a
          resize gets missed — and this app is installed as a PWA, where a
          rotate is a resize. */}
      <MobileNav tabs={TABS} current={tab} onSelect={setTab} />

      {/* The rail and the content share a row so the rail can sit beside the
          table on a wide screen. The grid column stays 56px even while the rail
          is expanded, so the rail floats over the content on hover instead of
          pushing it sideways — a layout that shifts under the pointer is worse
          than one that overlays. */}
      <div className="shell">
        <NavRail tabs={TABS} current={tab} onSelect={setTab} />

        {/* The tab panel is the page's main content; the topbar and footer are
            chrome around it. Without this landmark a screen reader can only jump
            by heading, and every tab change re-announces the whole page. */}
        <main className={`split${active.id === 'elements' ? ' is-wide' : ''}`}>
          {/* `.work` is the query container the tab cards measure themselves
              against, which is why it is a wrapper rather than the <main>
              itself: the history panel is a `.card` too, and a container on
              <main> would have the panel matching the card rules. */}
          <div className="work">
            {/* The tab's chunk is fetched on demand. The fallback is a plain
                card of the same height so the layout does not jump when the
                real one replaces it — a spinner that collapses to nothing and
                then expands is worse than no spinner. */}
            <Suspense fallback={<CardSkeleton label={t(`tabs.${active.id}`)} />}>
              <ActiveTab key={nonce} onRecord={record} restored={restored} theme={resolved} />
            </Suspense>
          </div>
          <HistoryPanel entries={entries} onRemove={remove} onReplay={replay} onClear={clear}
            onImport={importEntries} />
        </main>
      </div>

      {/* Above the footer, not inside it: the footer is a single line of small
          print and an install offer inside it reads as more small print. */}
      <InstallPrompt />

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

      <CalculatorDrawer open={calcOpen} onClose={() => setCalcOpen(false)} store={store} />
    </div>
  );
}
