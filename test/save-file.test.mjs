import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { saveFile, SAVE_FAILED, SAVE_VIA_SHARE } from '../src/ui/save-file.mjs';

/*
 * One save path, chosen by platform, for every way a file leaves this app.
 *
 * ## The defect, and why it needed a module rather than a patch
 *
 * Five call sites each did `Blob` → `createObjectURL` → click `<a download>`.
 * On the web that is a download. In an Android WebView it is **nothing**: the
 * WebView does not implement `download`, and Capacitor 7 sets no
 * `DownloadListener` to catch the click instead. No file, no error.
 *
 * Measured rather than assumed — a repository-wide search for
 * `DownloadListener` in `@capacitor/android@7.6.9` returns nothing, and
 * `BridgeWebViewClient.shouldOverrideUrlLoading` only routes. `MainActivity`
 * is an empty `BridgeActivity` subclass.
 *
 * So the tests below hold two things: the platform branch itself, and the fact
 * that there is only **one** place the branch lives. The second is what stops
 * the next export from being written the old way.
 */

/** A DOM stub just real enough for the browser route. */
function installDom() {
  const clicks = [];
  const revokes = [];
  /*
   * Snapshot the property descriptors and put them back verbatim.
   *
   * The first version restored by spreading `globalThis.URL` and setting
   * `revokeObjectURL: undefined`. Two things were wrong with it, and only the
   * second was visible on this machine. `undefined` is not the same as absent —
   * it left the global shadowed by a non-function. And `saveFile` schedules its
   * revoke through `setTimeout`, so with the *real* timer restored the callback
   * fired after teardown, against the shadowed global: an unhandled
   * `TypeError` reported by CI on all three platforms while all 2,686 tests
   * passed. Local runs never saw it because the stub's own `setTimeout` fired
   * the callback synchronously, inside the test.
   */
  const saved = new Map(
    ['URL', 'document', 'setTimeout'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  globalThis.URL = {
    ...globalThis.URL,
    createObjectURL: () => 'blob:stub',
    revokeObjectURL: (u) => revokes.push(u),
  };
  globalThis.document = {
    createElement: () => ({
      click() { clicks.push(this.download); },
      remove() {},
      set download(v) { this._d = v; },
      get download() { return this._d; },
    }),
    body: { appendChild() {}, removeChild() {} },
  };
  // Synchronous, so the revoke callback runs inside the test that scheduled it.
  globalThis.setTimeout = (fn) => { fn(); return 0; };
  return {
    clicks,
    revokes,
    restore: () => {
      for (const [k, desc] of saved) {
        if (desc) Object.defineProperty(globalThis, k, desc);
        else delete globalThis[k];
      }
      delete globalThis.Capacitor;
    },
  };
}

describe('the platform branch', () => {
  it('should use the browser download when there is no Capacitor', async () => {
    // The web build, and every test environment. This must not change.
    const dom = installDom();
    try {
      const result = await saveFile('hello', 'x.txt', 'text/plain');
      expect(result).not.toBe(SAVE_FAILED);
      expect(dom.clicks).toEqual(['x.txt']);
    } finally {
      dom.restore();
    }
  });

  it('should report a failure when a native platform cannot reach its plugins', async () => {
    /*
     * Not a fallback to the anchor. On Android that route produces no file, so
     * returning `SAVE_VIA_DOWNLOAD` would report success for a click the WebView
     * throws away — a silent no-op dressed as a success, which is precisely the
     * defect this module exists to remove. A native build with no plugins has a
     * real problem and says so.
     */
    const dom = installDom();
    globalThis.Capacitor = { isNativePlatform: () => true };
    try {
      await expect(saveFile('hello', 'x.txt', 'text/plain')).resolves.toBe(SAVE_FAILED);
      expect(dom.clicks, 'the anchor must not be used on a native platform').toEqual([]);
    } finally {
      dom.restore();
    }
  });

  it('should resolve the native route before the browser one inside saveFile', () => {
    /*
     * Read as source text, because the ordering *is* the fix — on Android the
     * click succeeds and does nothing, so there is no failure to detect after
     * the fact. A refactor that fell back to the anchor first would still pass
     * every behavioural test above, since the anchor is a no-op that reports
     * nothing.
     */
    const src = readFileSync('src/ui/save-file.mjs', 'utf8');
    const body = src.slice(src.indexOf('export async function saveFile('));
    const shareAt = body.indexOf('shareOut(filename, blob)');
    const downloadAt = body.indexOf('downloadInBrowser(blob, filename)');
    expect(shareAt).toBeGreaterThan(-1);
    expect(downloadAt).toBeGreaterThan(-1);
    expect(shareAt).toBeLessThan(downloadAt);
  });
});

describe('reported outcomes', () => {
  it('should report a failure rather than throwing when there is no DOM', async () => {
    // CI runs under Node, where `document` is absent.
    const original = globalThis.document;
    try {
      delete globalThis.document;
      await expect(saveFile('x', 'x.txt')).resolves.toBe(SAVE_FAILED);
    } finally {
      if (original) globalThis.document = original;
    }
  });

  it('should never reject, whatever the platform does', async () => {
    // A rejected promise from here would surface as an unhandled rejection in
    // whichever component forgot a `.catch`. The failure travels as a value —
    // including when the platform probe itself throws.
    const dom = installDom();
    globalThis.Capacitor = { isNativePlatform: () => { throw new Error('boom'); } };
    try {
      await expect(saveFile('x', 'x.txt')).resolves.toBeDefined();
    } finally {
      dom.restore();
    }
  });
});

describe('one route, not five', () => {
  it('should be the only place an object URL is created for a download', () => {
    /*
     * Five copies of the broken pattern is what let the Android defect survive:
     * fixing one would have left four, and the sixth export added would have
     * copied whichever it was written next to. The share-card path builds a
     * blob in a worker and the PNG has no other consumer, so it is listed.
     */
    const files = [
      'src/ui/export.mjs',
      'src/ui/components/CustomisePanel.jsx',
      'src/ui/components/Diagram.jsx',
      'src/ui/components/Fields.jsx',
    ];
    const offending = files.filter((f) => readFileSync(f, 'utf8').includes('URL.createObjectURL'));
    expect(offending, `these still build their own download: ${offending.join(', ')}`).toEqual([]);
  });

  it('should be imported by every file that used to download on its own', () => {
    const files = [
      'src/ui/export.mjs',
      'src/ui/components/CustomisePanel.jsx',
      'src/ui/components/Diagram.jsx',
      'src/ui/components/Fields.jsx',
    ];
    const missing = files.filter((f) => !readFileSync(f, 'utf8').includes("save-file.mjs"));
    expect(missing, `not routed through save-file: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('base64 for the native write', () => {
  it('should be the only encoding the native path adds', () => {
    // `Filesystem.writeFile` takes a string on native platforms and `Blob` is
    // web-only, so the bytes go through base64. It is bounded — a full history
    // is about 170 KB — and the chunked path is not needed.
    const src = readFileSync('src/ui/save-file.mjs', 'utf8');
    expect(src).toMatch(/readAsDataURL/);
    expect(src).toMatch(/Filesystem\.writeFile/);
    expect(src).toMatch(/Directory\.Cache/);
  });

  it('should write to the cache, which needs no Android permission', () => {
    // The reason this route was chosen over writing to shared storage at all:
    // `Directory.ExternalStorage` is inaccessible on Android 11+, and
    // `Directory.Documents` needs a runtime permission the app does not declare.
    const src = readFileSync('src/ui/save-file.mjs', 'utf8');
    expect(src).toMatch(/Cache, not `Documents`|Cache needs no permission/);
    expect(src).not.toMatch(/Directory\.ExternalStorage/);
  });
});
