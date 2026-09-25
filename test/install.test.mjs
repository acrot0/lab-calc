import { describe, it, expect, vi } from 'vitest';
import { isIos, isStandalone, installMode, watchInstall } from '../src/ui/install.mjs';

describe('isIos', () => {
  it('should recognise the iPhone and iPad user agents', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIos('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe(true);
  });

  it('should recognise iPadOS, which claims to be a Mac', () => {
    // Since iPadOS 13 the user agent is indistinguishable from desktop Safari
    // except for the touch points — miss this and every modern iPad is offered
    // the Chromium install button, which does not exist there.
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
    expect(isIos(ipad, 5)).toBe(true);
    // A real Mac has no touch points.
    expect(isIos(ipad, 0)).toBe(false);
  });

  it('should not claim a desktop browser is iOS', () => {
    expect(isIos('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(isIos('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
  });
});

describe('isStandalone', () => {
  it('should detect the standard display-mode media query', () => {
    const win = { matchMedia: () => ({ matches: true }) };
    expect(isStandalone(win)).toBe(true);
  });

  it('should detect the iOS legacy flag', () => {
    // iOS Safari does not answer the media query on older versions; it only
    // sets `navigator.standalone`.
    const win = { navigator: { standalone: true }, matchMedia: () => ({ matches: false }) };
    expect(isStandalone(win)).toBe(true);
  });

  it('should return false in a normal browser tab', () => {
    expect(isStandalone({ navigator: {}, matchMedia: () => ({ matches: false }) })).toBe(false);
  });

  it('should not throw when matchMedia is missing or refuses', () => {
    // Some embedded webviews have no matchMedia at all, and an exception here
    // would take the whole app down on boot.
    expect(isStandalone({ navigator: {} })).toBe(false);
    expect(isStandalone({ navigator: {}, matchMedia: () => { throw new Error('nope'); } })).toBe(false);
    expect(isStandalone(null)).toBe(false);
  });
});

describe('installMode', () => {
  const base = { canPrompt: false, standalone: false, ios: false, dismissed: false };

  it('should prefer the native prompt when one is available', () => {
    expect(installMode({ ...base, canPrompt: true })).toBe('prompt');
  });

  it('should fall back to written steps on iOS', () => {
    // iOS never fires beforeinstallprompt, so without this branch an iPhone
    // user is offered nothing at all.
    expect(installMode({ ...base, ios: true })).toBe('manual');
  });

  it('should stay silent once installed', () => {
    expect(installMode({ ...base, canPrompt: true, standalone: true })).toBe('none');
    expect(installMode({ ...base, ios: true, standalone: true })).toBe('none');
  });

  it('should stay silent after a dismissal', () => {
    // A prompt that comes back after being declined is a nag.
    expect(installMode({ ...base, canPrompt: true, dismissed: true })).toBe('none');
    expect(installMode({ ...base, ios: true, dismissed: true })).toBe('none');
  });

  it('should offer nothing on a desktop browser with no install support', () => {
    expect(installMode(base)).toBe('none');
  });
});

function fakeWin() {
  const listeners = new Map();
  return {
    addEventListener: (t, fn) => listeners.set(t, [...(listeners.get(t) ?? []), fn]),
    removeEventListener: (t, fn) => listeners.set(t, (listeners.get(t) ?? []).filter((f) => f !== fn)),
    fire: (t, e) => { for (const fn of listeners.get(t) ?? []) fn(e); },
    count: (t) => (listeners.get(t) ?? []).length,
  };
}

describe('watchInstall', () => {
  it('should hold the event and prevent the default', () => {
    // Without preventDefault Chromium shows its own mini-infobar and spends the
    // event, so the deferred prompt is gone before we can use it.
    const win = fakeWin();
    const preventDefault = vi.fn();
    watchInstall({ win, onAvailable: () => {} });
    win.fire('beforeinstallprompt', { preventDefault });
    expect(preventDefault).toHaveBeenCalled();
  });

  it('should report whether the user accepted', async () => {
    const win = fakeWin();
    let held;
    const api = watchInstall({ win, onAvailable: (e) => { held = e; } });
    const prompt = vi.fn();
    win.fire('beforeinstallprompt', { preventDefault: () => {}, prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });

    expect(await api.prompt()).toBe(true);
    expect(prompt).toHaveBeenCalled();
  });

  it('should return false when the user declines', async () => {
    const win = fakeWin();
    const api = watchInstall({ win, onAvailable: () => {} });
    win.fire('beforeinstallprompt', { preventDefault: () => {}, prompt: () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    expect(await api.prompt()).toBe(false);
  });

  it('should be single-use, and safe to call with nothing held', async () => {
    const win = fakeWin();
    const api = watchInstall({ win, onAvailable: () => {} });
    // Nothing held yet — must resolve false rather than throw.
    expect(await api.prompt()).toBe(false);

    win.fire('beforeinstallprompt', { preventDefault: () => {}, prompt: () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    expect(await api.prompt()).toBe(true);
    // The event cannot be reused; a second call must not try.
    expect(await api.prompt()).toBe(false);
  });

  it('should stop listening once stopped', () => {
    const win = fakeWin();
    const api = watchInstall({ win, onAvailable: () => {} });
    expect(win.count('beforeinstallprompt')).toBe(1);
    api.stop();
    expect(win.count('beforeinstallprompt')).toBe(0);
    expect(win.count('appinstalled')).toBe(0);
  });
});
