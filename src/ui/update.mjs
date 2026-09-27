/**
 * The desktop update check, as a state machine rather than a callback pile.
 *
 * ## Why a state machine
 *
 * The sequence is: check → maybe available → download with progress → install →
 * relaunch. Every step can fail, the whole thing can be triggered twice, and
 * the UI has to say something true at each point. Written as nested callbacks
 * that is a set of booleans that can disagree; written as a state it is one
 * value the panel renders directly, and the transitions are testable without a
 * browser.
 *
 * ## Why the check is manual
 *
 * The user asked for an app that does not interrupt. A background poll that
 * announces a new version mid-titration is exactly that interruption, and it
 * also means a network request the user did not ask for. So: a button in
 * settings, and nothing happens until it is pressed.
 *
 * ## What is not here
 *
 * No auto-download, no auto-install. An update replaces the running binary —
 * that is a decision the person at the bench makes, not a timer.
 */

/** The states the panel can be in, and what each one renders. */
export const UPDATE_STATES = [
  'idle', // nothing has been asked yet
  'checking', // a request is in flight
  'current', // checked, and this is the newest version
  'available', // checked, and there is a newer one
  'downloading', // install in progress
  'ready', // installed; a relaunch finishes it
  'error', // the last attempt failed
];

/**
 * The initial state.
 *
 * `supported` is false on the web and in the Android app, where there is no
 * updater to call. The panel uses it to decide whether to render at all, so it
 * is part of the state rather than a separate flag the caller has to remember.
 */
export function initialUpdateState({ supported = false } = {}) {
  return { status: 'idle', supported, version: null, notes: null, error: null, progress: null };
}

/**
 * Fold an updater event into the state.
 *
 * Kept as a pure reducer so the transitions can be asserted without a browser:
 * the failure this guards against is a progress event arriving after an error
 * and putting the panel back into `downloading`, which leaves a spinner on
 * screen forever with nothing behind it.
 */
export function reduceUpdate(state, event) {
  switch (event?.type) {
    case 'checkStarted':
      return { ...state, status: 'checking', error: null, progress: null };
    case 'checkFound':
      return {
        ...state,
        status: 'available',
        version: event.version ?? null,
        notes: event.notes ?? null,
        error: null,
      };
    case 'checkNone':
      return { ...state, status: 'current', version: null, notes: null, error: null };
    case 'downloadStarted':
      return { ...state, status: 'downloading', progress: 0, total: event.total ?? null };
    case 'downloadProgress': {
      // Ignore progress that arrives out of order. Once the state has left
      // `downloading` — because it finished or failed — a late chunk must not
      // drag it back, or the panel shows a download that already ended.
      if (state.status !== 'downloading') return state;
      /*
       * The event carries a chunk length, and the running total is kept here.
       *
       * Tauri 2 reports `chunkLength` per event with no cumulative field, so
       * whoever holds the state has to add them up. Doing it in the caller
       * instead put the arithmetic and the state in two places, and they
       * disagreed: the caller passed a running total and this case assigned it,
       * so every chunk overwrote the last and the bar showed only the most
       * recent chunk's size.
       */
      const chunk = event.chunkLength ?? 0;
      return { ...state, progress: (state.progress ?? 0) + chunk };
    }
    case 'downloadFinished':
      return { ...state, status: 'ready', progress: null };
    case 'failed':
      return { ...state, status: 'error', error: event.code ?? 'unknown', progress: null };
    case 'reset':
      return { ...state, status: 'idle', error: null, progress: null, version: null };
    default:
      return state;
  }
}

/**
 * What the panel should say, as a message key.
 *
 * Returns a key rather than a sentence so the copy lives in the locale files
 * with everything else, and so this function stays testable without one.
 */
export function updateMessageKey(state) {
  switch (state.status) {
    case 'checking': return 'update.checking';
    case 'current': return 'update.current';
    case 'available': return 'update.available';
    case 'downloading': return 'update.downloading';
    case 'ready': return 'update.ready';
    case 'error': return `update.err_${state.error}`;
    default: return null;
  }
}

/**
 * Whether the panel should offer the check button.
 *
 * Disabled while a check or a download is in flight — a second press would
 * start a second request, and two downloads writing the same file is a way to
 * end up with a corrupt installer.
 */
export function canCheck(state) {
  return state.supported && (state.status === 'idle' || state.status === 'current' || state.status === 'error');
}

/** Whether the panel should offer the install button. */
export function canInstall(state) {
  return state.supported && state.status === 'available';
}

/**
 * Whether the panel should offer the restart button.
 *
 * Only after an install. Tauri's `relaunch` is not a general-purpose restart
 * and there is nothing to restart for at any earlier point.
 */
export function canRelaunch(state) {
  return state.supported && state.status === 'ready';
}

/**
 * A download's completion, as a fraction in [0, 1], or null when unknown.
 *
 * The server does not always send a content length, and a progress bar that
 * assumes one divides by zero or jumps to 100% on the first chunk. Null means
 * "no percentage to show", which the panel renders as an indeterminate state
 * rather than inventing a number.
 */
export function downloadFraction(state) {
  if (state.status !== 'downloading') return null;
  const { progress, total } = state;
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(progress)) return null;
  return Math.min(1, Math.max(0, progress / total));
}

/**
 * Classify a thrown error into a code the locale files have a message for.
 *
 * The updater throws for a missing release (`latest.json` 404 on the first
 * release ever published), a bad signature, and a network failure. Those need
 * different words: the first is not a bug and will resolve itself, the second
 * means something is wrong with the release, the third is the user's network.
 */
export function classifyUpdateError(e) {
  const text = String(e?.message ?? e ?? '');
  /*
   * The plugin's own wording, measured on the packaged binary rather than
   * guessed: with no release published yet, `plugin:updater|check` rejects with
   * "Could not fetch a valid release JSON from the remote". That is the first
   * thing every user will hit — it is what the endpoint returns until the first
   * release exists — and it matched none of the obvious patterns, so it fell
   * through to "unknown" and told the user something was wrong with their app.
   */
  if (/release JSON|Failed to fetch|NetworkError|network|404|not found|timed? ?out|dns|connect/i.test(text)) {
    return 'network';
  }
  if (/signature|verif|minisign|public key/i.test(text)) return 'signature';
  if (/permission|denied|not allowed/i.test(text)) return 'permission';
  return 'unknown';
}

/**
 * Run a check, dispatching state changes through `onEvent`.
 *
 * The updater module is injected rather than imported so the whole flow can be
 * driven in a test with a stub — the real one needs a Tauri process, and a
 * test that needs a packaged binary is a test that never runs.
 *
 * Returns the final state. Never throws: every failure is a state, because a
 * rejected promise here would be an unhandled rejection in the settings panel
 * with nothing on screen to explain it.
 */
export async function runUpdateCheck({ updater, onEvent, state }) {
  let next = reduceUpdate(state, { type: 'checkStarted' });
  onEvent(next);
  try {
    const update = await updater.check();
    // `check()` returns null when there is nothing newer. That is the success
    // case, not an error — the plugin's own docs say so, and treating it as a
    // failure is the most common way this control ends up reporting a problem
    // on every press.
    if (!update) {
      next = reduceUpdate(next, { type: 'checkNone' });
      onEvent(next);
      return next;
    }
    next = reduceUpdate(next, {
      type: 'checkFound', version: update.version, notes: update.body,
    });
    onEvent(next);
    return next;
  } catch (e) {
    next = reduceUpdate(next, { type: 'failed', code: classifyUpdateError(e) });
    onEvent(next);
    return next;
  }
}

/** Download and install the update the last check found. */
export async function runUpdateInstall({ update, onEvent, state }) {
  let next = state;
  try {
    await update.downloadAndInstall((event) => {
      /*
       * Tauri 2 reports `chunkLength` per chunk, not a running total — the
       * running total is the caller's to keep. Reading `event.data.position`
       * (the v1 field name) yields undefined, and a progress bar fed undefined
       * sits at zero for the whole download.
       */
      if (event?.event === 'Started') {
        next = reduceUpdate(next, { type: 'downloadStarted', total: event.data?.contentLength });
      } else if (event?.event === 'Progress') {
        next = reduceUpdate(next, { type: 'downloadProgress', chunkLength: event.data?.chunkLength });
      }
      onEvent(next);
    });
    next = reduceUpdate(next, { type: 'downloadFinished' });
    onEvent(next);
    return next;
  } catch (e) {
    next = reduceUpdate(next, { type: 'failed', code: classifyUpdateError(e) });
    onEvent(next);
    return next;
  }
}
