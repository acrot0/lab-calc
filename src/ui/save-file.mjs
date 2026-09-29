/**
 * Getting a file out of the app, on every platform it runs on.
 *
 * ## The defect this exists for
 *
 * Every export in this app used the same three lines — `Blob` →
 * `URL.createObjectURL` → click an `<a download>` — copied into five places.
 * On the web that is a download. In an Android WebView it is **nothing at
 * all**: the WebView does not implement the `download` attribute, and
 * Capacitor 7 sets no `DownloadListener` to catch it instead. The click
 * resolves, no file is written, and no error is raised.
 *
 * Measured against the installed plugin rather than inferred: a repository-wide
 * search for `DownloadListener` in `@capacitor/android@7.6.9` returns nothing,
 * `BridgeWebViewClient.shouldOverrideUrlLoading` only routes, and the app's own
 * `MainActivity` is an empty `BridgeActivity` subclass.
 *
 * That matters more here than an ordinary missing feature. Every record lives
 * in `localStorage`, and export is the only way any of it leaves the device. A
 * user whose exports silently do nothing has a history they can neither back up
 * nor move — on the platform most of them use. So this is one module with one
 * decision in it, rather than five copies of a decision that was wrong.
 *
 * ## Why the five copies had to become one
 *
 * The exports are a JSON theme, an SVG diagram, a PNG share card, and four
 * history formats. Four of them are `Blob`s, one is a `Uint8Array`, one is a
 * string. Left as five call sites, fixing Android would mean remembering four
 * other places — and the next export added would use the broken pattern because
 * that is what the surrounding code does. There is one place now.
 *
 * ## The route, and the two rejected
 *
 * **Chosen: write into the app's cache, then open the system share sheet.**
 * Two first-party Capacitor plugins, both MIT, no native code, and no Android
 * storage permission — the cache directory belongs to the app.
 *
 * Rejected: `@capgo/capacitor-file-sharer`, which writes to MediaStore and so
 * lands in the system Downloads folder. Third-party, and **MPL-2.0**, which
 * `check-licences.mjs` places in its review set — compatible with an MIT
 * distribution, but it adds a licence judgement to every future dependency
 * review in exchange for a worse fit. A destination the user chooses is what
 * the desktop build already offers.
 *
 * Rejected: a hand-written `DownloadListener` plus a base64 bridge. No new
 * dependency, and it keeps the file off the share sheet, but it is ~150 lines
 * of Kotlin that only a real device can exercise, in a project whose entire
 * test suite runs in CI.
 *
 * ## What a caller must not promise
 *
 * `Share.share()` resolves when the chooser **opens**, not when the user
 * finishes saving — and on iOS the same call opens the same sheet. Nothing here
 * can tell whether a file was kept. The UI says "choose where to save", never
 * "saved".
 */

/**
 * What happened, for the caller's message.
 *
 * `SAVE_VIA_DOWNLOAD` is deliberately not exported. A caller cannot act on it:
 * it is the only outcome on the web, and a suspect one on Android, where the
 * anchor is ignored — it means "the click was dispatched", not "a file exists".
 * The two values that carry information are exported.
 */
const SAVE_VIA_DOWNLOAD = 'download';
export const SAVE_VIA_SHARE = 'share';
export const SAVE_FAILED = 'failed';

/**
 * Whether the native route applies.
 *
 * `Capacitor.isNativePlatform()` is the platform's own answer. A build without
 * Capacitor — the plain web build — has no global, and that is not an error:
 * it means the browser download is the correct route.
 */
function isNative(capacitor = globalThis.Capacitor) {
  return Boolean(capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform());
}

/**
 * Turn a Blob into the bare base64 payload `Filesystem.writeFile` wants.
 *
 * A data URL is `data:<mime>;base64,<payload>`, and the plugin rejects the
 * prefix. Splitting at the first comma rather than a fixed offset, because the
 * mime part varies and base64 never contains one.
 *
 * Bounded by the sizes this app produces — a full history is about 170 KB — so
 * the whole-payload encoding is fine and the chunked read path is not needed.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('could not read the export'));
    reader.onload = () => {
      const url = String(reader.result ?? '');
      const comma = url.indexOf(',');
      if (comma === -1) reject(new Error('unexpected data URL from FileReader'));
      else resolve(url.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Normalise the three shapes the call sites produce into one Blob.
 *
 * `Uint8Array` is what the .xlsx writer returns; a `Blob` is what the JSON and
 * SVG paths build; a string covers anything plain-text. One conversion point
 * means a caller cannot get the type wrong for one format and right for the
 * others.
 */
function toBlob(content, mime) {
  if (content instanceof Blob) return content;
  if (content instanceof Uint8Array || ArrayBuffer.isView(content)) return new Blob([content], { type: mime });
  return new Blob([content], { type: mime });
}

/**
 * Write a file into the app's cache and open the system share sheet.
 *
 * The plugin imports are dynamic: the web bundle must not carry two native
 * plugins it can never call, and `vite` can only drop them if the import is
 * inside a branch it can see is native-only.
 */
async function shareOut(filename, blob) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const data = await blobToBase64(blob);
  /*
   * `Directory.Cache`, not `Documents`.
   *
   * Cache needs no permission on any Android version, which is the reason this
   * route was chosen over writing to shared storage at all. The file is a
   * handoff to another app, and the system reclaiming it when space runs short
   * is correct behaviour for a file whose whole purpose is to leave.
   */
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Cache,
    recursive: true,
  });
  await Share.share({ title: filename, url: uri });
}

/** The browser route: an object URL and a synthetic click. */
function downloadInBrowser(blob, filename, win = globalThis) {
  const url = win.URL.createObjectURL(blob);
  const a = win.document.createElement('a');
  a.href = url;
  a.download = filename;
  win.document.body.appendChild(a);
  a.click();
  a.remove();
  /*
   * Revoked on the next task, not immediately.
   *
   * Revoking in the same turn cancels the download in some engines — the click
   * has been dispatched but the fetch behind it has not started. This was
   * already the behaviour at two of the five call sites, with a comment saying
   * why; the other three revoked immediately and got away with it.
   */
  win.setTimeout(() => win.URL.revokeObjectURL(url), 0);
}

/**
 * Save a file, by whichever route this platform has.
 *
 * Never throws. A refused share, a missing plugin and a browser with no
 * download path all return `SAVE_FAILED` so the caller can say something — this
 * module exists because silence was the previous behaviour.
 */
export async function saveFile(content, filename, mime = 'application/octet-stream') {
  const blob = toBlob(content, mime);

  /*
   * The native check is wrapped, and a native failure does **not** fall through.
   *
   * Both were wrong in the first draft. `isNative()` reads a global that a page
   * could have replaced, so a throw there must not escape as a rejected
   * promise — callers treat this function as total. And falling through to the
   * browser route on a native platform would report `SAVE_VIA_DOWNLOAD` for a
   * click that the WebView ignores: a silent no-op dressed as a success, which
   * is the exact defect this module exists to remove. A native platform that
   * cannot reach its plugins has a real problem and is told so.
   */
  let native = false;
  try {
    native = isNative();
  } catch { native = false; }

  if (native) {
    try {
      await shareOut(filename, blob);
      return SAVE_VIA_SHARE;
    } catch {
      return SAVE_FAILED;
    }
  }

  try {
    if (typeof document === 'undefined') return SAVE_FAILED;
    downloadInBrowser(blob, filename);
    return SAVE_VIA_DOWNLOAD;
  } catch {
    return SAVE_FAILED;
  }
}
