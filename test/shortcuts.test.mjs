import { describe, expect, it } from 'vitest';
import {
  SHORTCUTS, cycleTab, isTyping, matchShortcut, shouldIgnore, worksWhileTyping,
} from '../src/ui/shortcuts.mjs';

/*
 * The keyboard dispatcher.
 *
 * The rules worth testing are about *not* acting as much as acting: nothing
 * fires for a combination the browser owns, nothing fires for a keystroke an
 * input method is composing, and the two shortcuts that would eat a keystroke a
 * field needs are suppressed while typing. All of those are silent when they
 * break — the app still works, and the user's typing quietly goes somewhere
 * else — so they are asserted here rather than left to a manual check.
 */

/** A keystroke, with the fields the matcher reads. */
function key(k, mods = {}) {
  return {
    key: k,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
    keyCode: 0,
    ...mods,
  };
}

describe('shouldIgnore', () => {
  it('should ignore a keystroke while an input method is composing', () => {
    // A Chinese or Japanese IME sends a keydown per candidate keystroke. Acting
    // on them would navigate the app while the user is writing a word.
    expect(shouldIgnore(key('k', { ctrlKey: true, isComposing: true }))).toBe(true);
    expect(shouldIgnore(key('k', { ctrlKey: true, keyCode: 229 }))).toBe(true);
  });

  it('should ignore the combinations the browser and the OS own', () => {
    // Alt+Left is Back; Cmd+1 is a browser tab. Swallowing them is how an app
    // takes over the window.
    expect(shouldIgnore(key('ArrowLeft', { altKey: true }))).toBe(true);
    expect(shouldIgnore(key('k', { metaKey: true }))).toBe(true);
  });

  it('should not ignore a keystroke merely because a field has focus', () => {
    // This is the whole point of the split. Suppressing everything while typing
    // is what made Ctrl+K unable to close the calculator it had opened: the
    // window focuses its own entry, so the key that opened it was dead.
    expect(shouldIgnore(key('k', { ctrlKey: true }))).toBe(false);
  });

  it('should ignore a keystroke with no event at all', () => {
    expect(shouldIgnore(null)).toBe(true);
  });
});

describe('isTyping', () => {
  it('should be true for a text field and false for the page', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isTyping({ tagName }), tagName).toBe(true);
    }
    expect(isTyping({ tagName: 'BUTTON' })).toBe(false);
    expect(isTyping({ tagName: 'BODY' })).toBe(false);
    expect(isTyping(null)).toBe(false);
  });

  it('should be true for editable content', () => {
    expect(isTyping({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
});

describe('worksWhileTyping', () => {
  it('should let the calculator shortcut through while a field has focus', () => {
    // Otherwise the window cannot be closed from the keyboard: it focuses its
    // own entry when it opens, and the key that opened it would be dead.
    expect(worksWhileTyping('calc')).toBe(true);
    expect(worksWhileTyping('focusWork')).toBe(true);
  });

  it('should suppress the ones that would eat a keystroke the field needs', () => {
    // `Ctrl+←` and `Ctrl+→` move the caret a word at a time in a text field, so
    // a user editing an entry would switch tabs instead of moving the cursor.
    // A bare `?` is a character.
    expect(worksWhileTyping('nextTab')).toBe(false);
    expect(worksWhileTyping('prevTab')).toBe(false);
    expect(worksWhileTyping('help')).toBe(false);
  });
});

describe('matchShortcut', () => {
  it('should recognise the calculator shortcut in either case', () => {
    expect(matchShortcut(key('k', { ctrlKey: true }))).toBe('calc');
    expect(matchShortcut(key('K', { ctrlKey: true }))).toBe('calc');
  });

  it('should cycle tabs on the arrows, not on digits', () => {
    // Digits would collide with the keypad's own digits the moment the
    // calculator is open, which is the state a user is most likely to be in.
    expect(matchShortcut(key('ArrowRight', { ctrlKey: true }))).toBe('nextTab');
    expect(matchShortcut(key('ArrowLeft', { ctrlKey: true }))).toBe('prevTab');
    expect(matchShortcut(key('1', { ctrlKey: true }))).toBeNull();
  });

  it('should recognise the help key as a character, not as Shift+/', () => {
    // `?` is Shift+/ on most layouts but not on all of them, so the check is on
    // the character the browser reports rather than on the key and modifier.
    expect(matchShortcut(key('?'))).toBe('help');
    expect(matchShortcut(key('/', { ctrlKey: true }))).toBe('help');
  });

  it('should return null for a key it does not own', () => {
    // Every one of these must fall through to the browser.
    for (const k of ['a', 'Escape', 'Enter', 'Tab', 'F5', '/']) {
      expect(matchShortcut(key(k)), k).toBeNull();
    }
  });

  it('should not fire the calculator shortcut with Shift held', () => {
    // Ctrl+Shift+K is a different combination and belongs to whoever else
    // wants it; claiming it here would be claiming a key the app does not use.
    expect(matchShortcut(key('K', { ctrlKey: true, shiftKey: true }))).toBeNull();
  });
});

describe('cycleTab', () => {
  const ids = ['a', 'b', 'c'];

  it('should move forward and backward', () => {
    expect(cycleTab(ids, 'a', 1)).toBe('b');
    expect(cycleTab(ids, 'b', -1)).toBe('a');
  });

  it('should wrap at both ends', () => {
    // A key that stops responding at the last tab makes the user press the
    // other arrow to get back, which is not what they meant.
    expect(cycleTab(ids, 'c', 1)).toBe('a');
    expect(cycleTab(ids, 'a', -1)).toBe('c');
  });

  it('should start from the beginning when the current tab is unknown', () => {
    // Returning `undefined` would leave the app on a tab that does not exist.
    expect(cycleTab(ids, 'nope', 1)).toBe('a');
  });

  it('should survive an empty list', () => {
    expect(cycleTab([], 'a', 1)).toBe('a');
    expect(cycleTab(null, 'a', 1)).toBe('a');
  });
});

describe('the shortcut list', () => {
  it('should only list actions the matcher can return', () => {
    // The list is shown to the user, so a row for a shortcut that no longer
    // works is worse than no list at all. Every action named must be one
    // `matchShortcut` can produce.
    const reachable = new Set([
      matchShortcut(key('k', { ctrlKey: true })),
      matchShortcut(key('ArrowRight', { ctrlKey: true })),
      matchShortcut(key('ArrowLeft', { ctrlKey: true })),
      matchShortcut(key('j', { ctrlKey: true })),
      matchShortcut(key('?')),
    ]);
    for (const s of SHORTCUTS) {
      expect(reachable.has(s.action), `${s.action} is listed but unreachable`).toBe(true);
    }
  });

  it('should give every row keys and a label', () => {
    for (const s of SHORTCUTS) {
      expect(s.keys.length, `${s.action} has no keys`).toBeGreaterThan(0);
      expect(s.label, `${s.action} has no label`).toMatch(/^app\./);
    }
  });

  it('should mark the typing-sensitive shortcuts', () => {
    // The flag is what the dispatcher reads, so a shortcut that needs it and
    // lacks it would eat a keystroke the field needs.
    const typing = SHORTCUTS.filter((s) => s.typing).map((s) => s.action).sort();
    expect(typing).toEqual(['help', 'nextTab', 'prevTab']);
  });

  it('should resolve every label in both locales', async () => {
    const { zh } = await import('../src/ui/locales/zh.mjs');
    const { en } = await import('../src/ui/locales/en.mjs');
    for (const s of SHORTCUTS) {
      const [section, name] = s.label.split('.');
      for (const [loc, table] of [['zh', zh], ['en', en]]) {
        expect(typeof table[section]?.[name], `${loc}: ${s.label}`).toBe('string');
      }
    }
  });
});
