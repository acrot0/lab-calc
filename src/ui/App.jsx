import React, { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Icons, ICON_SIZE } from './icons.jsx';
import {
  resolveStore, loadHistory, saveHistory, addEntry, removeEntry, restoreEntry, clearHistory,
  planReplay, replayInputs, setEntryMeta, visibleEntries, deletedEntries, MAX_ENTRIES,
} from './history.mjs';
import { scaleInputs, recompute } from './scale-inputs.mjs';
import { recordSummary } from './summaries.mjs';
import {
  loadGroups, saveGroups, createGroup, renameGroup, removeGroup, setGroupNote, assignGroup,
} from './groups.mjs';
import { mergeEntries, downloadBundle } from './export.mjs';
import { hasAcknowledged, acknowledge } from './disclaimer.mjs';
import { useI18n } from './LocaleContext.jsx';
import { useTheme } from './ThemeContext.jsx';
import { useFields } from './FieldsContext.jsx';
import { defaultsOf } from './field-template.mjs';
import { tabDirection } from './tab-motion.mjs';
import { scenarioFor } from './scenarios.mjs';
import SettingsMenu from './components/SettingsMenu.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import NoticeModal from './components/NoticeModal.jsx';
import NavRail from './components/NavRail.jsx';
import MobileNav from './components/MobileNav.jsx';
import NavEditor from './components/NavEditor.jsx';
import { NavOrderProvider } from './NavOrderContext.jsx';
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
const AnalyticalTab = lazy(() => import('./tabs/AnalyticalTab.jsx'));
const PhysicalTab = lazy(() => import('./tabs/PhysicalTab.jsx'));
const StatsTab = lazy(() => import('./tabs/StatsTab.jsx'));
const UncertaintyTab = lazy(() => import('./tabs/UncertaintyTab.jsx'));

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
  /*
   * The four analysis tabs, in the order a study moves through them: measure
   * something and know how well you measured it, run the statistics on the
   * replicates, then the two branches of chemistry the earlier tabs did not
   * cover. Placed after the preparation tabs rather than before them, because
   * the bench order is prepare, measure, analyse.
   */
  { id: 'uncertainty', icon: Icons.uncertainty, Component: UncertaintyTab },
  { id: 'stats', icon: Icons.stats, Component: StatsTab },
  { id: 'analytical', icon: Icons.analytical, Component: AnalyticalTab },
  { id: 'physical', icon: Icons.physical, Component: PhysicalTab },
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
  const { t, locale } = useI18n();
  const { resolved } = useTheme();
  const { fields } = useFields();
  const [tab, setTab] = useState(initialTab);
  /*
   * Which way the last tab switch travelled, as `1`/`-1`/`0`.
   *
   * Held beside the tab rather than derived at render time, because by then the
   * previous tab is gone: the transition needs to know where the view came
   * *from*, and that is only available at the moment of the change.
   */
  const [tabDir, setTabDir] = useState(0);
  const [entries, setEntries] = useState([]);
  const [groups, setGroups] = useState([]);
  const [restored, setRestored] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [ackd, setAckd] = useState(true);
  const [calcOpen, setCalcOpen] = useState(false);
  // Lifted out of `SettingsMenu` so the `?` shortcut can open it. The menu owns
  // its own outside-click and Escape handling; it just no longer owns whether
  // it is open.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Lifted for the same reason as `settingsOpen`: two navigations can open it,
  // and the overlay has to outlive whichever one was clicked.
  const [navEditorOpen, setNavEditorOpen] = useState(false);
  const store = useMemo(() => resolveStore(), []);

  /*
   * Switch tabs, recording which way the view travelled.
   *
   * `goTo` is the only way the tab changes. A bare `setTab` would leave `tabDir`
   * describing the previous switch, so the transition would slide the wrong way
   * for every change that did not go through here — and the shortcut handler
   * below is bound once, so it cannot close over the current tab.
   */
  const goTo = useCallback((next) => {
    setTab((prev) => {
      setTabDir(tabDirection(prev, next, TAB_IDS));
      return next;
    });
  }, []);

  // The shortcut effect is bound with `[]` deps, so it reads the current tab and
  // the current `goTo` through refs rather than closing over a stale pair.
  const latest = useRef({ goTo });
  latest.current.goTo = goTo;
  const tabRef = useRef(tab);
  tabRef.current = tab;

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
        case 'nextTab': latest.current.goTo(cycleTab(TAB_IDS, tabRef.current, 1)); break;
        case 'prevTab': latest.current.goTo(cycleTab(TAB_IDS, tabRef.current, -1)); break;
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

  /*
   * Load once, and do not save until the load has landed.
   *
   * ## The bug this fixes
   *
   * The two effects below used to be siblings:
   *
   *     useEffect(() => setEntries(loadHistory(store)), [store]);
   *     useEffect(() => saveHistory(store, entries), [store, entries]);
   *
   * Effects run in order after the first paint, so on mount the save ran with
   * `entries` still `[]` — the initial state, not the loaded one — and wrote an
   * empty array over the stored history. The load's `setState` then scheduled a
   * re-render with the value it had read *before* the wipe.
   *
   * Measured on the dev server: seeding one record and reloading left
   * `localStorage` reading `[]`, with `saveHistory` having written `"[]"` three
   * times before anything rendered. Under `StrictMode` the double-invoked
   * effect makes it worse, but it is not a StrictMode bug — the ordering is
   * wrong on its own.
   *
   * ## Why this is the worst bug the project has had
   *
   * The app's whole pitch is 「每次计算自动留存」 — every calculation is kept.
   * It was not: the history was erased on every page load, so a user who
   * closed the tab and came back found an empty list and no way to know why.
   * Nothing failed loudly. No test covered it, because every test builds its
   * own store and calls the module functions directly; the module was correct
   * and the wiring was not.
   *
   * ## The fix
   *
   * `hydrated` gates the save. It starts false, the load effect sets it true
   * after reading, and the save effect returns early until then. So the first
   * save can only ever run with loaded state.
   *
   * The load effect also runs once (`[]` deps): re-reading on a store change
   * would clobber edits made since, and the store is resolved once from a
   * `useMemo` anyway.
   */
  const [hydrated, setHydrated] = useState(false);
  /*
   * Whether the last write to storage was rejected.
   *
   * `saveHistory` returns `false` when the store refuses — a full quota, Safari
   * private mode, a browser policy — and nothing checked it. The failure is
   * invisible by construction: React state still holds the new record, so the
   * list looks right and keeps looking right until the next page load, when it
   * is empty and there is no explanation.
   *
   * That is the one way this app's promise breaks silently. Every other failure
   * shows itself; a rejected write does not. So it is held here and rendered as
   * a standing banner, not a toast — the condition persists until the user acts
   * on it, and a message that disappears after three seconds is the wrong shape
   * for a condition that does not.
   */
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    setEntries(loadHistory(store));
    setGroups(loadGroups(store));
    setHydrated(true);
  }, [store]);
  useEffect(() => {
    if (!hydrated) return;
    setSaveFailed(!saveHistory(store, entries));
  }, [store, entries, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    saveGroups(store, groups);
  }, [store, groups, hydrated]);

  // Show the notice on first visit. Deferred to an effect rather than initial
  // state so it never flashes for a returning user.
  useEffect(() => {
    const acked = hasAcknowledged(store);
    setAckd(acked);
    if (!acked) setNoticeOpen(true);
  }, [store]);

  /*
   * A new record is born with the template's default metadata.
   *
   * A user who annotates fifty records with the same operator and the same
   * purpose should say it once, in settings. The defaults are applied here
   * rather than in `addEntry` so the pure history module never has to know
   * what the template in force is — and a template with no defaults produces
   * no `meta` at all, which is the shape every record had before this existed.
   */
  /*
   * Memoised on the field list, not called inline.
   *
   * `defaultsOf` builds a fresh object every call, so calling it in the render
   * body gave `record` a new identity on every render — and `record` is passed
   * as a prop to the active tab, so every state change anywhere in the app
   * re-rendered the whole tab and invalidated any `useCallback` inside it that
   * depended on the handler. `fields` is the only input, and it changes when
   * the template does, which is exactly when the defaults should be rebuilt.
   */
  const fieldDefaults = useMemo(() => defaultsOf(fields), [fields]);
  const record = useCallback((entry) => setEntries((prev) => {
    const seeded = Object.keys(fieldDefaults).length > 0
      ? { ...entry, meta: { ...fieldDefaults, ...(entry?.meta ?? {}) } }
      : entry;
    return addEntry(prev, seeded);
  }), [fieldDefaults]);
  /*
   * Batch scaling: re-make a saved preparation at another size.
   *
   * Writes a **new** record rather than editing the original. The original is
   * the record of what was actually done, and rewriting it would destroy the
   * audit trail the whole history design exists to keep — the same reason
   * deletion is a tombstone rather than a filter.
   *
   * The new record carries the original's metadata (so a scaled batch stays
   * filed under the same experiment) and its summary is regenerated from the
   * new outputs, so the list line matches the numbers behind it.
   *
   * A kind with no calculator cannot be scaled; `recompute` returns null and
   * this does nothing. The button is not rendered for those kinds either, so
   * this is the second line of defence rather than the first.
   */
  const scaleRecord = useCallback((entry, factor) => {
    const scaled = scaleInputs(replayInputs(entry), factor);
    const outputs = recompute(entry?.kind, scaled);
    if (!outputs) return;
    setEntries((prev) => addEntry(prev, {
      kind: entry.kind,
      inputs: scaled,
      outputs,
      summary: recordSummary({ kind: entry.kind, inputs: scaled, outputs }, t),
      // Provenance: the reader of the export can see this is a re-make, and of
      // what. Kept out of `meta` because `meta` is the user's own annotations
      // and the template whitelist would drop an unknown key.
      scaledFrom: { id: entry.id, factor },
    }));
  }, [t]);

  const remove = useCallback((id) => setEntries((prev) => removeEntry(prev, id)), []);
  const restore = useCallback((id) => setEntries((prev) => restoreEntry(prev, id)), []);
  /*
   * `prev` has to be passed through.
   *
   * The first version called `clearHistory()` with no argument, which falls
   * back to its `entries = []` default and returns an empty array — so "clear
   * all" wiped the tombstones along with the live records, which is precisely
   * the destruction the audit trail exists to prevent. The module was right and
   * the call site was wrong, which is why the module's own test stayed green.
   */
  const clear = useCallback(() => setEntries((prev) => clearHistory(prev)), []);

  /*
   * Two views of the same list, split here rather than inside the panel.
   *
   * `entries` keeps the deleted records — the file is the archive, and the
   * audit trail is only real if the record is still in it. Everything that
   * *presents* history reads `visible`; everything that *stores* it reads
   * `entries`. Splitting at the boundary is what keeps a deleted record from
   * reappearing in a count or an export because one caller forgot to filter.
   */
  const visible = useMemo(() => visibleEntries(entries), [entries]);
  const deleted = useMemo(() => deletedEntries(entries), [entries]);

  /*
   * Group operations write through to state, which the save effect persists.
   *
   * `create` returns the new group so the panel can select it — creating a
   * group is how the next record gets filed, so leaving the filter where it was
   * would make the user repeat a step they just took.
   */
  const makeGroup = useCallback((name) => {
    let made = null;
    setGroups((prev) => { const r = createGroup(prev, name); made = r.group; return r.groups; });
    return made;
  }, []);
  const rename = useCallback((id, name) => setGroups((prev) => renameGroup(prev, id, name)), []);
  const noteGroup = useCallback((id, note) => setGroups((prev) => setGroupNote(prev, id, note)), []);
  /*
   * Deleting a group orphans its records rather than deleting them.
   *
   * Both lists change, so both are updated here in one place. The alternative —
   * the panel removing the group and the records keeping a dangling id — shows
   * records that match no chip and vanish from every filter.
   */
  const dropGroup = useCallback((id) => {
    setEntries((prev) => { const r = removeGroup([], id, prev); return r.entries; });
    setGroups((prev) => removeGroup(prev, id, []).groups);
  }, []);
  const setRecordGroup = useCallback((id, groupId) => {
    setEntries((prev) => assignGroup(prev, id, groupId));
  }, []);

  /*
   * Annotating a record writes straight through to state, which the existing
   * save effect persists. No separate debounce: the editor commits on blur,
   * so the write rate is one per field edited rather than one per keystroke.
   */
  const setMeta = useCallback((id, patch) => {
    setEntries((prev) => setEntryMeta(prev, id, patch));
  }, []);

  // Import merges rather than replaces: a backup is usually one machine's
  // history being added to another's, and overwriting would destroy work the
  // user never agreed to lose.
  const importEntries = useCallback((incoming) => {
    setEntries((prev) => mergeEntries(prev, incoming, MAX_ENTRIES));
  }, []);

  const replay = useCallback((entry) => {
    const plan = planReplay(entry);
    if (!plan) return;
    goTo(plan.tab);
    setRestored(plan.inputs);
    setNonce((k) => k + 1);
  }, [goTo]);

  const acceptNotice = useCallback(() => {
    acknowledge(store);
    setAckd(true);
    setNoticeOpen(false);
  }, [store]);

  const active = TABS.find((x) => x.id === tab) ?? TABS[0];
  const ActiveTab = active.Component;
  const scenario = scenarioFor(active.id);

  /*
   * Fill the current tab with its worked example.
   *
   * This reuses the exact mechanism the history replay uses — `restored` plus a
   * nonce to remount — so no tab needs to know scenarios exist. It is the same
   * call `replay` makes, with inputs from a file instead of from a record.
   */
  const runScenario = useCallback(() => {
    if (!scenario) return;
    setRestored(scenario.inputs);
    setNonce((k) => k + 1);
  }, [scenario]);

  return (
    /*
      The tab order wraps the whole app rather than sitting inside the two
      navigations, because three things read it — the phone bar, the desktop
      rail, and the editor — and the editor has to outlive whichever navigation
      opened it. Nesting it here rather than in `main.jsx` keeps `TAB_IDS` local:
      the provider needs the live tab list, and the tab list is defined in this
      file.
    */
    <NavOrderProvider allIds={TAB_IDS} store={store}>
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <BrandMark size={30} />
          <div className="brand-text">
            <h1>{t('app.title')}</h1>
          </div>
        </div>
        <div className="topbar-actions">
          {/*
            The worked example for the tab you are on.

            In the topbar rather than inside each tab, because all twenty tabs
            would need the same control and the same `restored` plumbing —
            twenty copies of one button is twenty places for it to drift. Here
            it is one button that reads the active tab's scenario and hands it
            to the tab through the mechanism the history replay already uses.

            Absent on the periodic table, which is a reference rather than a
            form and has no scenario to run.
          */}
          {scenario && (
            <button
              type="button"
              className="control example-btn"
              onClick={runScenario}
              title={scenario.why[locale] ?? scenario.why.zh}
            >
              <Icons.example size={ICON_SIZE.control} aria-hidden="true" />
              <span className="control-label">{t('app.example')}</span>
            </button>
          )}
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

      {/*
        The standing banner for a rejected storage write.

        Above the navigations rather than inside the history panel: the panel is
        one column of one tab, and a user whose writes have stopped failing is
        not necessarily looking at it. This has to be seen from anywhere in the
        app, because "your calculations are no longer being kept" is a fact
        about the whole app.

        `role="alert"` rather than `status` — the notice rule for import
        feedback uses `status`, which waits for a pause in speech. This one is
        the app's core promise breaking, so it interrupts.

        No dismiss button, on purpose. A condition that persists should not be
        dismissible; the only thing that clears it is a successful write. The
        export button is the way out, and it is right here rather than only in
        the history panel's menu.
      */}
      {saveFailed && (
        <div className="save-failed" role="alert">
          <Icons.warning size={ICON_SIZE.inline} aria-hidden="true" />
          <div className="save-failed-text">
            <strong>{t('history.saveFailedTitle')}</strong>
            <span>{t('history.saveFailedBody')}</span>
          </div>
          <button type="button" className="save-failed-export" onClick={() => downloadBundle(entries)}>
            {t('history.saveFailedExport')}
          </button>
        </div>
      )}

      {/* Two navigations, one shown at a time by a media query. The rail is the
          desktop shape — sixteen tabs fit down a column but not across a row —
          and the bottom bar is the phone shape, where a thumb expects it.

          Both are rendered because CSS decides which is visible; hiding one in
          JavaScript would mean measuring the viewport in React, which is how a
          resize gets missed — and this app is installed as a PWA, where a
          rotate is a resize. */}
      <MobileNav tabs={TABS} current={tab} onSelect={goTo} onEditNav={() => setNavEditorOpen(true)} />

      {/* The rail and the content share a row so the rail can sit beside the
          table on a wide screen. The grid column stays 56px even while the rail
          is expanded, so the rail floats over the content on hover instead of
          pushing it sideways — a layout that shifts under the pointer is worse
          than one that overlays. */}
      <div className="shell">
        <NavRail tabs={TABS} current={tab} onSelect={goTo} onEditNav={() => setNavEditorOpen(true)} />

        {/* The tab panel is the page's main content; the topbar and footer are
            chrome around it. Without this landmark a screen reader can only jump
            by heading, and every tab change re-announces the whole page. */}
        <main className={`split${active.id === 'elements' ? ' is-wide' : ''}`}>
          {/* `.work` is the query container the tab cards measure themselves
              against, which is why it is a wrapper rather than the <main>
              itself: the history panel is a `.card` too, and a container on
              <main> would have the panel matching the card rules. */}
          {/* `data-dir` drives the direction of the switch transition: the card
              comes in from the side the user moved toward, so a rail click and
              an arrow key both confirm which way they went. It lives on `.work`
              rather than on a new wrapper element because the card is a direct
              child of `.work` in several layout rules, and an extra div between
              them would silently drop every one of them. */}
          <div className="work" data-dir={tabDir}>
            {/* The tab's chunk is fetched on demand. The fallback is a plain
                card of the same height so the layout does not jump when the
                real one replaces it — a spinner that collapses to nothing and
                then expands is worse than no spinner. */}
            <Suspense fallback={<CardSkeleton label={t(`tabs.${active.id}`)} />}>
              <ActiveTab key={nonce} onRecord={record} restored={restored} theme={resolved} />
            </Suspense>
          </div>
          <HistoryPanel entries={visible} allEntries={entries} deleted={deleted}
            groups={groups} onRemove={remove} onRestore={restore} onReplay={replay} onClear={clear}
            onImport={importEntries} onMeta={setMeta} onScale={scaleRecord}
            onCreateGroup={makeGroup} onRenameGroup={rename} onDeleteGroup={dropGroup}
            onGroupNote={noteGroup} onSetRecordGroup={setRecordGroup} />
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

      {navEditorOpen && (
        <NavEditor tabs={TABS} onClose={() => setNavEditorOpen(false)} />
      )}
    </div>
    </NavOrderProvider>
  );
}
