import { describe, it, expect, vi } from 'vitest';
import {
  UPDATE_STATES, initialUpdateState, reduceUpdate, updateMessageKey,
  canCheck, canInstall, canRelaunch, downloadFraction, classifyUpdateError,
  runUpdateCheck, runUpdateInstall,
} from '../src/ui/update.mjs';

/*
 * The desktop update flow.
 *
 * The config side (is the key present, is signing on, does CI pass the secret)
 * is `update-channel.test.mjs`. This is the other half: what the panel does
 * when the user presses the button, including every way it can fail.
 *
 * Tested against a stub updater rather than the real plugin, because the real
 * one needs a Tauri process — a test that needs a packaged binary is a test
 * that never runs in CI.
 */

const supported = () => initialUpdateState({ supported: true });

describe('the state machine', () => {
  it('should start idle and unsupported unless told otherwise', () => {
    const s = initialUpdateState();
    expect(s.status).toBe('idle');
    expect(s.supported).toBe(false);
    // Unsupported means the panel does not render at all: on the web build
    // there is no updater to call, and a button that cannot work is worse than
    // no button.
    expect(canCheck(s)).toBe(false);
  });

  it('should name only states the panel knows how to render', () => {
    // A status outside this list renders as an empty panel — the message key
    // lookup returns null and nothing replaces it.
    const reached = new Set([supported().status]);
    for (const type of ['checkStarted', 'checkNone', 'checkFound', 'downloadStarted',
      'downloadFinished', 'failed', 'reset']) {
      reached.add(reduceUpdate(supported(), { type }).status);
    }
    for (const s of reached) expect(UPDATE_STATES).toContain(s);
  });

  it('should not go back to downloading when progress arrives late', () => {
    /*
     * The failure this catches: the download finishes (or fails), and a chunk
     * event that was already queued arrives afterwards and moves the state back
     * to `downloading`. The panel then shows a progress bar forever with no
     * download behind it — the app looks hung and the only way out is to close
     * it.
     */
    const ready = reduceUpdate(supported(), { type: 'downloadFinished' });
    const after = reduceUpdate(ready, { type: 'downloadProgress', chunkLength: 500 });
    expect(after.status).toBe('ready');
    expect(after).toBe(ready);

    const failed = reduceUpdate(supported(), { type: 'failed', code: 'network' });
    expect(reduceUpdate(failed, { type: 'downloadProgress', chunkLength: 500 }).status).toBe('error');
  });

  it('should accumulate progress from chunk lengths, not from a total', () => {
    // Tauri 2 sends `chunkLength` per event and no running total. Treating it as
    // a total makes the bar sit near zero for the whole download.
    let s = reduceUpdate(supported(), { type: 'downloadStarted', total: 1000 });
    s = reduceUpdate(s, { type: 'downloadProgress', chunkLength: 300 });
    s = reduceUpdate(s, { type: 'downloadProgress', chunkLength: 300 });
    expect(downloadFraction(s)).toBeCloseTo(0.6, 6);
  });

  it('should report no fraction when the server sends no length', () => {
    // No content-length is normal behind some proxies. Returning a number here
    // means dividing by zero or claiming 100% on the first chunk; null means
    // the panel shows an indeterminate state instead.
    let s = reduceUpdate(supported(), { type: 'downloadStarted' });
    s = reduceUpdate(s, { type: 'downloadProgress', chunkLength: 500 });
    expect(downloadFraction(s)).toBeNull();
  });

  it('should clamp the fraction to one', () => {
    // Chunk accounting can overshoot when the server's length is approximate.
    let s = reduceUpdate(supported(), { type: 'downloadStarted', total: 100 });
    s = reduceUpdate(s, { type: 'downloadProgress', chunkLength: 150 });
    expect(downloadFraction(s)).toBe(1);
  });
});

describe('which control is offered when', () => {
  it('should offer check when idle, current or after a failure', () => {
    expect(canCheck(supported())).toBe(true);
    expect(canCheck(reduceUpdate(supported(), { type: 'checkNone' }))).toBe(true);
    expect(canCheck(reduceUpdate(supported(), { type: 'failed', code: 'network' }))).toBe(true);
  });

  it('should not offer check while one is in flight', () => {
    // Two concurrent checks, and worse two concurrent downloads writing the
    // same file, is how an installer ends up corrupt.
    expect(canCheck(reduceUpdate(supported(), { type: 'checkStarted' }))).toBe(false);
    expect(canCheck(reduceUpdate(supported(), { type: 'downloadStarted' }))).toBe(false);
    expect(canCheck(reduceUpdate(supported(), { type: 'downloadFinished' }))).toBe(false);
  });

  it('should offer install only once an update is known to exist', () => {
    expect(canInstall(reduceUpdate(supported(), { type: 'checkFound', version: '1.0.0' }))).toBe(true);
    expect(canInstall(reduceUpdate(supported(), { type: 'checkNone' }))).toBe(false);
    expect(canInstall(supported())).toBe(false);
  });

  it('should offer relaunch only after an install', () => {
    expect(canRelaunch(reduceUpdate(supported(), { type: 'downloadFinished' }))).toBe(true);
    expect(canRelaunch(reduceUpdate(supported(), { type: 'checkFound', version: '1.0.0' }))).toBe(false);
  });

  it('should offer nothing at all when unsupported', () => {
    const s = initialUpdateState({ supported: false });
    expect(canCheck(s)).toBe(false);
    expect(canInstall(s)).toBe(false);
    expect(canRelaunch(s)).toBe(false);
  });
});

describe('the message for each state', () => {
  it('should give every state a key', () => {
    for (const status of ['checking', 'current', 'available', 'downloading', 'ready']) {
      expect(updateMessageKey({ status })).toBeTruthy();
    }
  });

  it('should give a failure a key that names the cause', () => {
    // "Something went wrong" tells the user nothing. A missing release (404 on
    // the first release ever) is not a bug and resolves itself; a bad signature
    // means the release is wrong; a network error is the user's connection.
    expect(updateMessageKey({ status: 'error', error: 'network' })).toBe('update.err_network');
    expect(updateMessageKey({ status: 'error', error: 'signature' })).toBe('update.err_signature');
  });

  it('should give idle no message', () => {
    expect(updateMessageKey({ status: 'idle' })).toBeNull();
  });
});

describe('classifyUpdateError', () => {
  it('should recognise the plugin wording for a missing release', () => {
    /*
     * Measured on the packaged binary, not guessed. With no release published
     * yet the plugin rejects with exactly this sentence, and it matched none of
     * the obvious patterns — so the first thing every user presses the button
     * for reported "原因不明" instead of "还没有发布更新包".
     */
    expect(classifyUpdateError(new Error('Could not fetch a valid release JSON from the remote'))).toBe('network');
    expect(classifyUpdateError(new Error('HTTP 404 Not Found'))).toBe('network');
    expect(classifyUpdateError(new Error('Failed to fetch'))).toBe('network');
    expect(classifyUpdateError(new Error('error sending request: connection refused'))).toBe('network');
  });

  it('should not classify a signature failure as a network problem', () => {
    // Both arrive as a rejected promise with a message. Telling them apart is
    // the difference between "try again later" and "the release is wrong".
    expect(classifyUpdateError(new Error('signature verification failed'))).toBe('signature');
    expect(classifyUpdateError(new Error('invalid public key'))).toBe('signature');
  });

  it('should recognise a signature failure', () => {
    expect(classifyUpdateError(new Error('signature verification failed'))).toBe('signature');
  });

  it('should fall back to unknown rather than guessing', () => {
    expect(classifyUpdateError(new Error('kaboom'))).toBe('unknown');
    expect(classifyUpdateError(null)).toBe('unknown');
  });
});

describe('runUpdateCheck', () => {
  const drive = async (checkImpl) => {
    const seen = [];
    const final = await runUpdateCheck({
      updater: { check: checkImpl },
      state: supported(),
      onEvent: (s) => seen.push(s.status),
    });
    return { final, seen };
  };

  it('should report the new version when there is one', async () => {
    const { final, seen } = await drive(async () => ({ version: '1.2.3', body: 'notes' }));
    expect(seen).toEqual(['checking', 'available']);
    expect(final.version).toBe('1.2.3');
    expect(final.notes).toBe('notes');
  });

  it('should treat a null result as up to date, not as an error', async () => {
    /*
     * The plugin returns null when nothing is newer. It is the success case,
     * and reading it as a failure is the most common way this control ends up
     * reporting a problem on every press.
     */
    const { final, seen } = await drive(async () => null);
    expect(seen).toEqual(['checking', 'current']);
    expect(final.status).toBe('current');
  });

  it('should turn a thrown error into a state rather than a rejection', async () => {
    // An unhandled rejection inside the settings panel is a blank panel and a
    // console nobody is looking at.
    const { final, seen } = await drive(async () => { throw new Error('HTTP 404'); });
    expect(seen).toEqual(['checking', 'error']);
    expect(final.error).toBe('network');
  });
});

describe('runUpdateInstall', () => {
  const drive = async (impl) => {
    const seen = [];
    const state = reduceUpdate(supported(), { type: 'checkFound', version: '1.2.3' });
    const final = await runUpdateInstall({
      update: { downloadAndInstall: impl },
      state,
      onEvent: (s) => seen.push(s.status),
    });
    return { final, seen };
  };

  it('should walk started → progress → ready', async () => {
    const { final, seen } = await drive(async (cb) => {
      cb({ event: 'Started', data: { contentLength: 100 } });
      cb({ event: 'Progress', data: { chunkLength: 40 } });
      cb({ event: 'Progress', data: { chunkLength: 60 } });
      cb({ event: 'Finished' });
    });
    expect(seen[0]).toBe('downloading');
    expect(seen[seen.length - 1]).toBe('ready');
    expect(final.status).toBe('ready');
  });

  it('should sum the chunk lengths', async () => {
    const fractions = [];
    const state = reduceUpdate(supported(), { type: 'checkFound', version: '1.2.3' });
    await runUpdateInstall({
      update: {
        downloadAndInstall: async (cb) => {
          cb({ event: 'Started', data: { contentLength: 200 } });
          cb({ event: 'Progress', data: { chunkLength: 50 } });
          cb({ event: 'Progress', data: { chunkLength: 150 } });
        },
      },
      state,
      onEvent: (s) => fractions.push(downloadFraction(s)),
    });
    expect(fractions).toContain(0.25);
    expect(fractions).toContain(1);
  });

  it('should turn a failed install into an error state', async () => {
    const { final, seen } = await drive(async () => {
      throw new Error('signature verification failed');
    });
    expect(seen).toContain('error');
    expect(final.error).toBe('signature');
    // Not left mid-download: a spinner with nothing behind it reads as a hang.
    expect(final.progress).toBeNull();
  });
});

describe('the real plugin is only reachable from the desktop build', () => {
  it('should not import the updater plugin outside a Tauri build', async () => {
    /*
     * `@tauri-apps/plugin-updater` calls into an IPC bridge that does not exist
     * on the web. A static import in a module the web build bundles would throw
     * at import time — the whole app, not just the settings panel.
     *
     * Asserted on the source because the alternative is building and loading
     * every target, which CI does not do for the web bundle's module graph.
     */
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/ui/update.mjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/^\s*import .*@tauri-apps/m);
    // And the panel that does import it must gate on the build constant.
    const panel = fs.readFileSync(
      new URL('../src/ui/components/UpdatePanel.jsx', import.meta.url), 'utf8',
    );
    expect(panel).toMatch(/__TAURI_UPDATER__/);
    expect(panel).toMatch(/import\(/); // dynamic, so the web bundle never loads it
  });
});

describe('the build constant decides whether the control exists', () => {
  /*
   * The web build and the Tauri build differ in exactly one thing here: whether
   * the settings panel renders the update row. That is a `define` in
   * `vite.config.js`, and a `define` that resolves to the wrong value is
   * invisible — the panel just quietly does not appear, or quietly appears on a
   * build with no updater behind it.
   *
   * Asserted on the built output, which is the only place the substitution is
   * visible. The web build has already run by the time this suite runs in CI
   * (`npm run build` precedes `npm test` there is not guaranteed, so the check
   * is skipped rather than failing when `dist/` is absent).
   */
  const distExists = async () => {
    const fs = await import('node:fs');
    return fs.existsSync('dist/assets');
  };

  it('should compile the guard to a constant rather than leaving it unresolved', async () => {
    if (!(await distExists())) return;
    const fs = await import('node:fs');
    const files = fs.readdirSync('dist/assets').filter((n) => n.endsWith('.js'));
    const bundle = files.map((f) => fs.readFileSync(`dist/assets/${f}`, 'utf8')).join('\n');
    // An unresolved identifier would be a runtime ReferenceError the moment the
    // settings panel rendered — the whole app, not just the row.
    expect(bundle).not.toMatch(/__TAURI_UPDATER__/);
  });

  it('should keep the plugin import out of any chunk the web build loads eagerly', async () => {
    if (!(await distExists())) return;
    const fs = await import('node:fs');
    const files = fs.readdirSync('dist/assets').filter((n) => n.endsWith('.js'));
    // The panel's own chunk may mention the plugin — it is the one chunk that
    // would import it, and only from inside `supported`. What must not happen
    // is the entry bundle pulling it in, which would evaluate the IPC bridge on
    // load and throw before anything rendered.
    const entry = files.find((n) => n.startsWith('index-'));
    const src = fs.readFileSync(`dist/assets/${entry}`, 'utf8');
    expect(src).not.toMatch(/@tauri-apps\/plugin-(updater|process)/);
  });
});
