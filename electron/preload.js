/**
 * Preload script.
 *
 * Exposes exactly one thing to the renderer: whether it is running inside the
 * desktop shell, and which version. Nothing else — no filesystem, no IPC
 * surface, no `require`.
 *
 * This exists because the app is otherwise identical in the browser and on the
 * desktop, and it should stay that way. The one place the two differ is that a
 * desktop user has a real window and a real menu, so the app can label itself
 * correctly; that is all this is for.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('labCalcDesktop', {
  isDesktop: true,
  platform: process.platform,
});
