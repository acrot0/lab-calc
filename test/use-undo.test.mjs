// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useUndo, UNDO_MS } from '../src/ui/use-undo.mjs';

/*
 * React refuses to batch updates through `act` unless the environment says it
 * is a test. Without this flag every mount logs "not configured to support
 * act(...)" and this suite would be measuring noise.
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/*
 * The undo bar's state machine.
 *
 * The behaviour that matters is not that a message appears — it is that the
 * undo runs *once*, for the action that announced it, and that letting the bar
 * expire is not itself a second action. Those are the three ways a countdown
 * UI goes wrong, and none of them is visible in a screenshot.
 *
 * Mounted through a real root rather than `@testing-library/react`: this
 * project has no testing-library dependency, and the whole reason `dom-render`
 * exists is that a hook's effect behaviour is not reachable any other way.
 */

/** Mount a component and hand back its latest hook result. */
function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const box = { value: null, unmount: () => { act(() => root.unmount()); host.remove(); } };
  function Probe() {
    box.value = useUndo();
    return null;
  }
  act(() => root.render(React.createElement(Probe)));
  return box;
}

describe('useUndo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should start with nothing pending', () => {
    const box = mount();
    expect(box.value.pending).toBeNull();
    box.unmount();
  });

  it('should hold the message it was offered', () => {
    const box = mount();
    act(() => box.value.offer('已删除 1 条记录', () => {}));
    expect(box.value.pending.text).toBe('已删除 1 条记录');
    box.unmount();
  });

  it('should run the undo when asked', () => {
    const undo = vi.fn();
    const box = mount();
    act(() => box.value.offer('x', undo));
    act(() => box.value.run());
    expect(undo).toHaveBeenCalledTimes(1);
    box.unmount();
  });

  it('should dismiss the bar once the undo has run', () => {
    const box = mount();
    act(() => box.value.offer('x', () => {}));
    act(() => box.value.run());
    expect(box.value.pending).toBeNull();
    box.unmount();
  });

  it('should not run the undo twice when the button is pressed twice', () => {
    // The second press has nothing left to undo. Running the callback again
    // would re-insert the record a second time, and the user would see a
    // duplicate appear where the first press had already restored it.
    const undo = vi.fn();
    const box = mount();
    act(() => box.value.offer('x', undo));
    act(() => box.value.run());
    act(() => box.value.run());
    expect(undo).toHaveBeenCalledTimes(1);
    box.unmount();
  });

  it('should drop the bar when the countdown expires, and not undo anything', () => {
    // Letting it time out is not an action. Nothing is lost — the trash section
    // is the durable undo — so the only thing that should change is the bar.
    const undo = vi.fn();
    const box = mount();
    act(() => box.value.offer('x', undo));
    act(() => { vi.advanceTimersByTime(UNDO_MS); });
    expect(box.value.pending).toBeNull();
    expect(undo).not.toHaveBeenCalled();
    box.unmount();
  });

  it('should not run an expired action when the button is pressed after the timeout', () => {
    // The race the ref exists to close: the render that shows the bar and the
    // state the button reads are one frame apart.
    const undo = vi.fn();
    const box = mount();
    act(() => box.value.offer('x', undo));
    act(() => { vi.advanceTimersByTime(UNDO_MS); });
    act(() => box.value.run());
    expect(undo).not.toHaveBeenCalled();
    box.unmount();
  });

  it('should replace a pending action rather than race it', () => {
    // Two deletes in quick succession: the first bar must not fire while the
    // second is on screen, or the user sees a record restored that they did not
    // ask for, under a bar describing neither action.
    const first = vi.fn();
    const second = vi.fn();
    const box = mount();
    act(() => box.value.offer('第一次', first));
    act(() => { vi.advanceTimersByTime(UNDO_MS / 2); });
    act(() => box.value.offer('第二次', second));

    act(() => { vi.advanceTimersByTime(UNDO_MS / 2); });
    expect(first).not.toHaveBeenCalled();
    expect(box.value.pending.text).toBe('第二次');

    act(() => box.value.run());
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    box.unmount();
  });

  it('should let the countdown restart for the replacement action', () => {
    // Measuring the second action against the first action's remaining time
    // would dismiss it almost immediately, which reads as the bar failing.
    const box = mount();
    act(() => box.value.offer('第一次', () => {}));
    act(() => { vi.advanceTimersByTime(UNDO_MS - 1); });
    act(() => box.value.offer('第二次', () => {}));
    act(() => { vi.advanceTimersByTime(2); });
    expect(box.value.pending?.text).toBe('第二次');
    box.unmount();
  });

  it('should clear the timer when the component unmounts mid-countdown', () => {
    // The panel can be closed while the bar is up. A timer that outlives the
    // tree calls setState on an unmounted component, which React warns about
    // and which the mount-effect guard has to prevent.
    const undo = vi.fn();
    const box = mount();
    act(() => box.value.offer('x', undo));
    box.unmount();
    act(() => { vi.advanceTimersByTime(UNDO_MS * 2); });
    expect(undo).not.toHaveBeenCalled();
  });
});
