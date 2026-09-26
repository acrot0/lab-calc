import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  GRAB_MARGIN, DEFAULT_INSET,
  clampPosition, defaultPosition, dragTo, isDragHandle, keyboardInset,
} from '../src/ui/float-window.mjs';

const VIEW = { width: 1440, height: 900 };
const SIZE = { width: 420, height: 560 };

describe('defaultPosition', () => {
  it('should open clear of the bottom-right corner', () => {
    const p = defaultPosition(SIZE, VIEW);
    expect(p.x).toBe(VIEW.width - SIZE.width - DEFAULT_INSET);
    expect(p.y).toBe(VIEW.height - SIZE.height - DEFAULT_INSET);
  });

  it('should stay on screen when the viewport is smaller than the window', () => {
    // A 900px-tall window in a 600px viewport must not open at a negative
    // offset, where the title bar would be above the top edge and unreachable.
    const p = defaultPosition({ width: 900, height: 900 }, { width: 600, height: 600 });
    expect(p.x).toBeGreaterThanOrEqual(DEFAULT_INSET);
    expect(p.y).toBeGreaterThanOrEqual(DEFAULT_INSET);
  });
});

describe('clampPosition', () => {
  it('should leave an in-bounds position alone', () => {
    const p = { x: 100, y: 200 };
    expect(clampPosition(p, SIZE, VIEW)).toEqual(p);
  });

  it('should keep the grab margin when dragged off the right edge', () => {
    // Flush against the edge puts the close button a pixel from the
    // scrollbar, and the window cannot be grabbed again without a precise
    // click. The margin is what makes it recoverable.
    const p = clampPosition({ x: 99999, y: 0 }, SIZE, VIEW);
    expect(p.x).toBe(VIEW.width - GRAB_MARGIN);
  });

  it('should allow hanging off the left edge but not past the grab margin', () => {
    const p = clampPosition({ x: -99999, y: 0 }, SIZE, VIEW);
    expect(p.x).toBe(GRAB_MARGIN - SIZE.width);
    // Some of the window is still on screen.
    expect(p.x + SIZE.width).toBe(GRAB_MARGIN);
  });

  it('should never let the title bar go above the top', () => {
    expect(clampPosition({ x: 0, y: -500 }, SIZE, VIEW).y).toBe(0);
  });

  it('should keep the title bar on screen when dragged below', () => {
    const p = clampPosition({ x: 0, y: 99999 }, SIZE, VIEW);
    expect(p.y).toBe(VIEW.height - GRAB_MARGIN);
  });

  it('should produce a position inside the viewport for any input', () => {
    // The property that matters: whatever the user does, the window stays
    // reachable. Checked across a grid rather than at a few points.
    for (const x of [-5000, -100, 0, 700, 1439, 5000]) {
      for (const y of [-5000, -100, 0, 400, 899, 5000]) {
        const p = clampPosition({ x, y }, SIZE, VIEW);
        expect(p.x + SIZE.width, `x=${x}`).toBeGreaterThanOrEqual(GRAB_MARGIN);
        expect(p.x, `x=${x}`).toBeLessThanOrEqual(VIEW.width - GRAB_MARGIN);
        expect(p.y, `y=${y}`).toBeGreaterThanOrEqual(0);
        expect(p.y, `y=${y}`).toBeLessThanOrEqual(VIEW.height - GRAB_MARGIN);
      }
    }
  });

  it('should leave a grabbable strip, not just a visible one', () => {
    /*
     * The margin has to clear the title bar's controls, and this is the bug
     * that proved it.
     *
     * `isDragHandle` refuses to start a drag on a button — correctly, since
     * dragging a control makes it unusable. At a 48px margin the entire visible
     * strip of title bar was the close button, so a window dragged to the left
     * edge was on screen, looked reachable, and could not be moved at all. The
     * only way back was to clear the stored position by hand.
     *
     * Measured against the real controls: the title bar's right end holds a
     * DEG/RAD toggle and a close button, which come to about 90px including
     * their padding and gap.
     */
    const CONTROLS_AT_RIGHT_END = 90;
    expect(GRAB_MARGIN).toBeGreaterThan(CONTROLS_AT_RIGHT_END);
  });
});

describe('dragTo', () => {
  it('should move the window by the pointer delta', () => {
    const p = dragTo({ x: 100, y: 100 }, { x: 50, y: 50 }, { x: 80, y: 70 });
    expect(p).toEqual({ x: 130, y: 120 });
  });

  it('should return to the starting position when the pointer does', () => {
    /*
     * The reason the delta is measured from the drag's start rather than from
     * the current position. Accumulating per-event deltas drifts on every
     * pointermove, so a drag out and back does not return the window — which
     * reads as the window slipping under the cursor.
     */
    const start = { x: 200, y: 150 };
    const from = { x: 10, y: 10 };
    const there = dragTo(start, from, { x: 300, y: 220 });
    const back = dragTo(start, from, from);
    expect(back).toEqual(start);
    expect(there).not.toEqual(start);
  });

  it('should handle a drag of zero distance', () => {
    expect(dragTo({ x: 5, y: 5 }, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 5, y: 5 });
  });
});

describe('isDragHandle', () => {
  /** A minimal stand-in for the DOM nodes the real function walks. */
  const node = (opts = {}) => ({
    closest: () => opts.interactive ?? null,
    parent: null,
  });
  const handle = (children) => ({ contains: (t) => children.includes(t) });

  it('should accept a press on the title bar itself', () => {
    const bar = node();
    expect(isDragHandle(bar, handle([bar]))).toBe(true);
  });

  it('should refuse a press that started on a button', () => {
    // The title bar holds the close button and the deg/rad toggle. Dragging
    // those would make them nearly unusable: two pixels of movement between
    // press and release turns a click into a drag.
    const btn = node({ interactive: {} });
    expect(isDragHandle(btn, handle([btn]))).toBe(false);
  });

  it('should refuse a press outside the handle', () => {
    const outside = node();
    expect(isDragHandle(outside, handle([]))).toBe(false);
  });

  it('should refuse null rather than throwing', () => {
    expect(isDragHandle(null, handle([]))).toBe(false);
    expect(isDragHandle(node(), null)).toBe(false);
  });
});

describe('keyboardInset', () => {
  const viewport = { width: 390, height: 844 };

  it('should report zero when no keyboard is up', () => {
    expect(keyboardInset(viewport, { height: 844, offsetTop: 0 })).toBe(0);
  });

  it('should report the height the keyboard covers', () => {
    // A 336px keyboard over an 844px viewport: the sheet has to lift by 336.
    expect(keyboardInset(viewport, { height: 508, offsetTop: 0 })).toBe(336);
  });

  it('should subtract a visual-viewport offset from the covered height', () => {
    // Zoomed or scrolled, the visual viewport shifts down as well as shrinking.
    // Counting only the height difference would overstate the inset by the
    // shift, and lift the sheet further than the keyboard actually reaches.
    expect(keyboardInset(viewport, { height: 508, offsetTop: 100 })).toBe(236);
  });

  it('should never report a negative inset', () => {
    // A visual viewport taller than the layout one happens during a browser
    // toolbar collapse. A negative inset would push the sheet below the bottom
    // edge, so it is clamped rather than passed through.
    expect(keyboardInset(viewport, { height: 900, offsetTop: 0 })).toBe(0);
  });

  it('should return zero when the API is missing', () => {
    // Desktop, and browsers older than `visualViewport`. Neither has a software
    // keyboard, so zero is the correct answer rather than an error.
    expect(keyboardInset(viewport, undefined)).toBe(0);
    expect(keyboardInset(undefined, { height: 508, offsetTop: 0 })).toBe(0);
  });

  it('should tolerate a missing offsetTop', () => {
    expect(keyboardInset(viewport, { height: 508 })).toBe(336);
  });
});

describe('mobile layout regressions', () => {
  /*
   * The topbar's control row overflowed a phone.
   *
   * Four controls — language, icon style, material, theme — are 507px
   * together. The row wrapped to its own line and then overflowed *that* line,
   * because the flex items would not shrink below their content width. The
   * document was 524px wide in a 390px viewport, so every screen scrolled
   * sideways and the right-hand controls could not be reached at all.
   *
   * Asserted against the stylesheet rather than by rendering: the fix is three
   * CSS declarations, and a DOM test would need a real layout engine to catch
   * their absence.
   */
  const css = readFileSync('src/ui/styles.css', 'utf8');
  const narrow = css.slice(css.indexOf('@media (max-width: 620px)'));
  const block = narrow.slice(0, narrow.indexOf('/* ===='));

  it('should let the topbar controls wrap within their row', () => {
    expect(block).toMatch(/\.topbar-actions\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('should let a topbar control shrink below its content width', () => {
    // Without `min-width: 0` a flex item refuses to shrink past its content,
    // which is what held the row open at 507px.
    expect(block).toMatch(/\.topbar-actions\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
  });

  it('should drop the control labels before dropping a control', () => {
    // The icon carries the meaning once the row is tight; hiding a whole
    // control would hide a setting the user came to change.
    expect(block).toMatch(/\.topbar-actions\s+\.control-label\s*\{\s*display:\s*none/);
  });
});

describe('calculator touch targets', () => {
  /*
   * Asserted against the stylesheet rather than by rendering, for the same
   * reason as the topbar block above: the fix is a handful of declarations, and
   * proving their absence needs a real layout engine plus a pointer emulation
   * that jsdom does not have.
   *
   * The measured starting point, at 390x844 in Chromium: keys 40px, DEG/RAD
   * 48x28, unit chips 28px, the function-page switch 30px. All under the 44px
   * floor, on the surface a thumb is meant to hit without looking.
   */
  const css = readFileSync('src/ui/styles.css', 'utf8');
  const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
  const block = coarse.slice(0, coarse.indexOf('/* ===='));

  it('should size the keypad keys for a fingertip', () => {
    expect(block).toMatch(/\.calc-key\s*\{[^}]*min-height:\s*44px/);
  });

  it('should size every other control in the panel to match', () => {
    // A panel that mixes 28px and 44px targets makes the user calibrate per
    // control, which is the opposite of what a keypad is for.
    for (const sel of ['\\.calc-mode', '\\.calc-chip', '\\.calc-page', '\\.calc-fill']) {
      expect(block, sel).toMatch(new RegExp(`${sel}\\s*\\{[^}]*44px`));
    }
  });

  it('should key on the pointer rather than on a width', () => {
    // The defect is the input device, not the screen size: a touch laptop at
    // 1440px has the same fingertip as a phone. A width breakpoint would leave
    // it unfixed.
    expect(css).toMatch(/@media \(pointer: coarse\)/);
  });

  it('should lift the sheet clear of the software keyboard', () => {
    // `dvh` does not know about the keyboard, so the sheet has to be told.
    expect(css).toMatch(/\.calc-drawer\s*\{[^}]*bottom:\s*var\(--kb-inset/);
    expect(css).toMatch(/max-height:\s*calc\(100dvh\s*-\s*var\(--kb-inset/);
  });
});
