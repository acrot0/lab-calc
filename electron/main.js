/**
 * Electron main process.
 *
 * The app is a static bundle, so this file's whole job is to put it in a window
 * and take away everything the user did not ask for. No Node in the renderer,
 * no remote module, no navigation away from the app: a calculator that can
 * reach the network is a calculator that can be talked into reaching the wrong
 * thing.
 */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

/** Read the app version out of the packaged manifest, falling back to the build. */
function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = readVersion();

/**
 * Only one instance may run.
 *
 * Without this, a second double-click starts a second copy with its own window
 * and its own in-memory state. Since history lives in localStorage — which is
 * per-profile, not per-process — two copies writing it is a recipe for a lost
 * entry. The second launch focuses the window that already exists instead.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  function createWindow() {
    win = new BrowserWindow({
      width: 1240,
      height: 860,
      minWidth: 720,
      minHeight: 560,
      // Matches --bg in src/ui/styles.css. Without it the window paints white
      // for the frame or two before the renderer commits its first paint, which
      // reads as a flash on a dark app.
      backgroundColor: '#0f1115',
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        // The renderer runs third-party-free app code, but these are set
        // anyway: the app has no use for Node, so it should not have it.
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
      },
    });

    // Show only once the first frame is ready, so the window never appears
    // empty and then fills in.
    win.once('ready-to-show', () => win.show());

    // External links open in the system browser rather than replacing the app.
    // The app itself has no outbound links today; this is here so that adding
    // one later cannot turn the window into a browser with no way back.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
      const isSelf = url.startsWith('file://');
      if (!isSelf) {
        event.preventDefault();
        if (/^https?:/.test(url)) shell.openExternal(url);
      }
    });

    // A renderer that fails to load shows an empty window with no explanation.
    // Say what happened instead of leaving the user with a blank rectangle.
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      if (code === -3) return; // ERR_ABORTED: a normal cancelled navigation
      dialog.showErrorBox(
        'Lab Calc 加载失败',
        `无法载入界面。\n\n${desc} (${code})\n${url}\n\n` +
        '安装可能不完整，请重新解压整个文件夹后重试。',
      );
    });

    win.loadFile(path.join(__dirname, 'app', 'index.html'));
    win.on('closed', () => { win = null; });
  }

  /**
   * A trimmed menu.
   *
   * Electron's default menu is English, includes an items list that does not
   * apply, and puts Reload one keystroke away from a user who meant to type.
   * This keeps what is genuinely useful and drops the rest.
   */
  function buildMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
      ...(isMac ? [{ role: 'appMenu' }] : []),
      {
        label: '文件',
        submenu: [
          {
            label: '导出计算记录…',
            // The export lives in the app (history panel), so this only
            // focuses the window; it exists to make the feature discoverable
            // from the menu the way a desktop user expects.
            click: () => win?.webContents.executeJavaScript(
              "document.querySelector('.history-panel')?.scrollIntoView({block:'start'})",
            ),
          },
          { type: 'separator' },
          { role: isMac ? 'close' : 'quit', label: isMac ? '关闭窗口' : '退出' },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' },
          { role: 'selectAll', label: '全选' },
        ],
      },
      {
        label: '视图',
        submenu: [
          { role: 'resetZoom', label: '实际大小' },
          { role: 'zoomIn', label: '放大' },
          { role: 'zoomOut', label: '缩小' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: '全屏' },
          { type: 'separator' },
          { role: 'reload', label: '重新载入' },
          { role: 'toggleDevTools', label: '开发者工具' },
        ],
      },
      {
        label: '帮助',
        submenu: [
          {
            label: `关于 Lab Calc ${VERSION}`,
            click: () => {
              dialog.showMessageBox(win, {
                type: 'info',
                title: '关于 Lab Calc',
                message: `Lab Calc ${VERSION}`,
                detail:
                  '实验室溶液计算器 — 教学与学习用途。\n\n'
                  + '不可用于临床、诊断、生产或任何有法规要求的场景。\n'
                  + '详见应用内的「使用须知」。\n\n'
                  + 'MIT 许可 · 开源',
                buttons: ['好'],
              });
            },
          },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  app.whenReady().then(() => {
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
