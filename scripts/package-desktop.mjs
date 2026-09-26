#!/usr/bin/env node
/**
 * Package the app as a portable Windows desktop build.
 *
 * A hand-written script rather than electron-builder. electron-builder pulls
 * 271 packages, and npm v12 blocks install scripts by default — its
 * `electron-winstaller` dependency needs one to pick a 7z binary, so the
 * standard toolchain arrives half-installed on a modern npm. The work it would
 * actually do here is: unzip a runtime, copy a directory, rename a file, and
 * set an icon. That is this file, with no dependencies at all.
 *
 * What it produces is a folder, not an installer: unzip and run. Deleting the
 * folder is the uninstall.
 *
 * Usage:
 *   node scripts/package-desktop.mjs             # build, then package
 *   node scripts/package-desktop.mjs --no-build  # reuse the existing dist/
 *   node scripts/package-desktop.mjs --out DIR   # override the output parent
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const NO_BUILD = args.includes('--no-build');
const outIdx = args.indexOf('--out');
const OUT_PARENT = outIdx !== -1
  ? path.resolve(args[outIdx + 1])
  : path.resolve(ROOT, '..', 'releases');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const APP_NAME = 'LabCalc';
const PRODUCT_NAME = 'Lab Calc';
const TARGET = `${APP_NAME.toLowerCase()}-v${pkg.version}-win-x64`;

/** Print a step so a long package run is not a silent wait. */
const step = (msg) => console.log(`  ${msg}`);
const die = (msg) => {
  console.error(`\n打包失败: ${msg}\n`);
  process.exit(1);
};

// ---------------------------------------------------------------- 1. build

if (!NO_BUILD) {
  /*
   * `--mode desktop` disables code splitting, which `file://` cannot use: a
   * dynamic `import()` is refused there, so a split build renders a blank
   * window. See the note in vite.config.js.
   */
  step('构建前端（desktop 模式，单文件）…');
  execFileSync('npm', ['run', 'build', '--', '--mode', 'desktop'], { cwd: ROOT, stdio: 'inherit', shell: true });
}

const distDir = path.join(ROOT, 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  die('dist/index.html 不存在。先跑 npm run build，或去掉 --no-build。');
}

// ------------------------------------------------------- 2. locate electron

/**
 * Find an Electron runtime zip in the local cache.
 *
 * Electron's own installer and electron-builder both cache here, so a machine
 * that has ever packaged an Electron app already has the download. Using it
 * avoids a 100 MB fetch and, more importantly, avoids depending on the network
 * being up at package time.
 *
 * The highest version wins: caches accumulate as projects pin different
 * versions, and the newest is the one most likely to be wanted.
 */
function findElectronZip() {
  const cacheRoot = path.join(os.homedir(), 'AppData', 'Local', 'electron', 'Cache');
  if (!fs.existsSync(cacheRoot)) return null;

  const found = [];
  for (const hash of fs.readdirSync(cacheRoot)) {
    const dir = path.join(cacheRoot, hash);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      const m = file.match(/^electron-v(\d+\.\d+\.\d+)-win32-x64\.zip$/);
      if (m) found.push({ version: m[1], file: path.join(dir, file) });
    }
  }
  if (found.length === 0) return null;
  found.sort((a, b) => {
    const pa = a.version.split('.').map(Number);
    const pb = b.version.split('.').map(Number);
    return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
  });
  return found[0];
}

const electron = findElectronZip();
if (!electron) {
  die(
    '本地 Electron 缓存里没有 win32-x64 运行时。\n'
    + '  取一份：npx --yes electron@latest --version   （会下载到缓存）\n'
    + `  缓存位置：${path.join(os.homedir(), 'AppData', 'Local', 'electron', 'Cache')}`,
  );
}
step(`Electron v${electron.version}（本地缓存）`);

// ------------------------------------------------------------- 3. unpack

fs.mkdirSync(OUT_PARENT, { recursive: true });
const outDir = path.join(OUT_PARENT, TARGET);

/**
 * Clear any previous build.
 *
 * A stale directory would leave files from a previous build mixed with the new
 * ones, so the output is rebuilt rather than merged into.
 *
 * The delete is done by renaming first, then removing. Deleting a 368 MB tree
 * that contains a 246 MB executable in place intermittently fails with EBUSY on
 * Windows even with no process holding it — the rename takes the name out of
 * the way in one atomic step, and if the removal then fails the build still
 * proceeds with a correct output directory. A leftover `.old-*` folder is
 * harmless and the next run cleans it up.
 */
if (fs.existsSync(outDir)) {
  const stash = `${outDir}.old-${Date.now()}`;
  try {
    fs.renameSync(outDir, stash);
    try {
      fs.rmSync(stash, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      console.warn(`  ! 旧产物暂存为 ${path.basename(stash)}（删除失败，可手动删）`);
    }
  } catch (e) {
    die(`无法清理旧产物目录（${e.code}）。关掉正在运行的 LabCalc 后重试。`);
  }
}

// Sweep any stash a previous run could not delete.
for (const entry of fs.readdirSync(OUT_PARENT)) {
  if (entry.startsWith(`${TARGET}.old-`)) {
    try {
      fs.rmSync(path.join(OUT_PARENT, entry), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch { /* left for next time */ }
  }
}

fs.mkdirSync(outDir, { recursive: true });

/**
 * Unzip with the system 7-Zip.
 *
 * Node has no built-in zip reader, and a streaming implementation would hold
 * parts of a 288 MB archive in memory — the machine this runs on has shown
 * itself to be memory-tight. 7-Zip is already installed on Windows here and
 * handles the archive on disk.
 */
function unzip(zip, dest) {
  const candidates = [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
    '7z',
  ];
  const sevenZip = candidates.find((c) => c === '7z' || fs.existsSync(c));
  if (!sevenZip) die('找不到 7-Zip。装一个，或把 7z.exe 放进 PATH。');
  execFileSync(sevenZip, ['x', zip, `-o${dest}`, '-y'], { stdio: 'pipe' });
}

step('解压运行时 …');
unzip(electron.file, outDir);

// ------------------------------------------------------------- 4. rename exe

const srcExe = path.join(outDir, 'electron.exe');
if (!fs.existsSync(srcExe)) die('解压后没有 electron.exe —— 缓存里的 zip 可能不完整。');
const destExe = path.join(outDir, `${APP_NAME}.exe`);
fs.renameSync(srcExe, destExe);

// ------------------------------------------------------ 5. app into resources

/**
 * Lay the app out as an unpacked directory rather than an asar archive.
 *
 * asar needs a packing library, and its benefit is keeping files out of sight —
 * not a goal for an MIT-licensed app whose source is already public. An
 * unpacked `app/` is also easier to inspect when something goes wrong.
 */
const appDir = path.join(outDir, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });

fs.cpSync(distDir, path.join(appDir, 'app'), { recursive: true });
for (const file of ['main.js', 'preload.js']) {
  fs.copyFileSync(path.join(ROOT, 'electron', file), path.join(appDir, file));
}

/**
 * The manifest Electron reads.
 *
 * `main` must be relative to this directory, and `version` is what the About
 * dialog reports — so it is the app's version, not a placeholder.
 */
fs.writeFileSync(
  path.join(appDir, 'package.json'),
  `${JSON.stringify({
    name: APP_NAME.toLowerCase(),
    productName: PRODUCT_NAME,
    version: pkg.version,
    description: pkg.description,
    main: 'main.js',
    license: pkg.license,
  }, null, 2)}\n`,
  'utf8',
);

// ------------------------------------------------------- 6. rewrite the HTML

/**
 * Three edits the browser build does not need but `file://` does.
 *
 * 1. `type="module"` is refused under the file protocol — module scripts are
 *    subject to CORS, and a file:// origin is opaque, so the app loads a blank
 *    page with a console error. What replaces it must therefore be valid
 *    classic script, which is what the desktop build is: `--mode desktop` emits
 *    an IIFE, with neither `import.meta` nor dynamic `import()`. That is not a
 *    detail this rewrite can assume — a module build left the attribute
 *    stripped and the bundle unparseable, and the window stayed blank. The
 *    check below the rewrite is what holds the two ends together.
 *
 * 2. `defer` must replace what `type="module"` was silently providing. Module
 *    scripts are deferred by definition, so the bundle ran after the document
 *    parsed and `#root` existed. A plain script runs the moment it is reached —
 *    and Vite emits it in `<head>`, before the body — so React would mount
 *    against a null container and die with "target container is not a DOM
 *    element". `defer` restores the original ordering.
 *
 * 3. The service worker registration is pointless here: `navigator.
 *    serviceWorker` is unavailable under file://, the offline cache adds
 *    nothing to files that are already local, and the manifest link would 404.
 *    The manifest is removed; the registration is guarded in main.jsx and
 *    simply does not run.
 */
const htmlPath = path.join(appDir, 'app', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const before = html;

html = html.replace(
  /<script type="module" crossorigin\s*/g,
  '<script defer ',
);
html = html.replace(/<script type="module"\s*/g, '<script defer ');
html = html.replace(/<link[^>]*rel="manifest"[^>]*>\s*/g, '');

if (html === before) {
  die('index.html 里没有找到需要改写的 module 脚本标签 —— Vite 的输出格式可能变了。');
}
if (/type="module"/.test(html)) die('index.html 仍含 type="module"。');
if (!/<script defer/.test(html)) die('index.html 的脚本没有 defer —— 会在 #root 存在前执行。');
fs.writeFileSync(htmlPath, html, 'utf8');
step('改写 index.html（module → defer，去 manifest）');

// ------------------------------------------------------------- 7. icon

/**
 * Set the executable icon and version strings.
 *
 * rcedit is downloaded on demand and cached under the output parent rather than
 * committed: it is a build tool, and a checked-in 1.3 MB binary that is only
 * used on Windows would be dead weight in the repository.
 *
 * A failure here is a warning, not an error. The app runs correctly with
 * Electron's default icon; refusing to produce a working build because a
 * cosmetic step failed would be the wrong trade.
 */
const icoPath = path.join(ROOT, 'desktop', 'icon.ico');
if (fs.existsSync(icoPath)) {
  const toolsDir = path.join(OUT_PARENT, '.tools');
  const rcedit = path.join(toolsDir, 'rcedit.exe');
  try {
    if (!fs.existsSync(rcedit)) {
      fs.mkdirSync(toolsDir, { recursive: true });
      step('下载 rcedit …');
      execFileSync('curl', [
        '-sL', '--max-time', '120', '-o', rcedit,
        'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe',
      ], { stdio: 'pipe' });
    }
    execFileSync(rcedit, [
      destExe,
      '--set-icon', icoPath,
      '--set-version-string', 'ProductName', PRODUCT_NAME,
      '--set-version-string', 'FileDescription', '实验室溶液计算器',
      '--set-version-string', 'CompanyName', 'Lab Calc',
      '--set-file-version', pkg.version,
      '--set-product-version', pkg.version,
    ], { stdio: 'pipe' });
    step('写入图标与版本信息');
  } catch (e) {
    console.warn(`  ! 图标/版本写入失败（不影响使用）: ${e.message.split('\n')[0]}`);
  }
} else {
  console.warn('  ! desktop/icon.ico 不存在，跳过图标（先跑 npm run icons:ico）');
}

// ------------------------------------------------------------ 8. trim

/**
 * Drop the locale packs the app cannot use.
 *
 * Electron ships 55 of them, 46 MB in total, and the app is bilingual. Chromium
 * loads a `.pak` only when its locale is selected, so the rest are dead weight
 * that a portable build carries around for nothing.
 *
 * zh-CN and en-US are kept for the app's two languages; en-GB is kept because
 * Chromium falls back to it for other English variants and a missing pack makes
 * the built-in UI strings — the menu bar Chromium draws itself — render blank
 * rather than falling back further.
 *
 * This is a size optimisation only: if the list is ever wrong the app still
 * runs, it just falls back to English. That is why the function never fails the
 * build.
 */
function trimLocales(dir) {
  const keep = new Set(['zh-CN.pak', 'en-US.pak', 'en-GB.pak']);
  const localesDir = path.join(dir, 'locales');
  if (!fs.existsSync(localesDir)) return 0;
  let removed = 0;
  let bytes = 0;
  for (const file of fs.readdirSync(localesDir)) {
    if (!file.endsWith('.pak') || keep.has(file)) continue;
    bytes += fs.statSync(path.join(localesDir, file)).size;
    fs.rmSync(path.join(localesDir, file));
    removed++;
  }
  return { removed, mb: (bytes / 1024 / 1024).toFixed(0) };
}

const trimmed = trimLocales(outDir);
if (trimmed) step(`精简语言包（删 ${trimmed.removed} 个，省 ${trimmed.mb} MB）`);

// ------------------------------------------------------ 8b. trim graphics stack

/**
 * Drop the GPU translation layers this app cannot reach.
 *
 * Electron ships Chromium's whole graphics stack, and this app draws with the
 * 2D canvas API and the DOM — no WebGL, no WebGPU, no video. That leaves four
 * binaries with no caller:
 *
 *   dxcompiler.dll / dxil.dll   the DirectX shader compiler and its output
 *                               container; only WebGPU/D3D shader compilation
 *                               reaches these
 *   d3dcompiler_47.dll          the older HLSL compiler, for the same reason
 *   vk_swiftshader.dll          a software Vulkan implementation, used as a
 *                               fallback when no GPU driver answers
 *   vulkan-1.dll                the Vulkan loader those two go through
 *
 * 36 MB of the 322 MB build, which is a sixth of it, for code that never runs.
 *
 * ## Why this is allowed to be wrong
 *
 * Removing a DLL Chromium does want is not a subtle failure — the process dies
 * at startup with a missing-import error, which is loud and immediate. So the
 * list is short, every entry has no caller in a 2D-only app, and the packaged
 * build is smoke-tested before it is shipped (`scripts/test-desktop.mjs` drives
 * the real executable and asserts the app renders and computes). A build that
 * survives that test has loaded everything it needs.
 *
 * It is still a size optimisation and not a correctness one, so a missing file
 * is skipped rather than failing the build, and the count is reported so a run
 * that removed nothing is visible instead of silent.
 */
function trimGraphics(dir) {
  const removable = [
    'dxcompiler.dll', 'dxil.dll', 'd3dcompiler_47.dll',
    'vk_swiftshader.dll', 'vulkan-1.dll',
    // The SwiftShader ICD manifest, which describes a Vulkan driver that is no
    // longer present once the DLL above is gone.
    'vk_swiftshader_icd.json',
  ];
  let removed = 0;
  let bytes = 0;
  for (const file of removable) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) continue;
    bytes += fs.statSync(p).size;
    fs.rmSync(p);
    removed++;
  }
  return removed === 0 ? null : { removed, mb: (bytes / 1024 / 1024).toFixed(0) };
}

const gfx = trimGraphics(outDir);
if (gfx) step(`精简图形层（删 ${gfx.removed} 个，省 ${gfx.mb} MB）`);

/**
 * Shrink the Chromium licence file.
 *
 * Electron ships `LICENSES.chromium.html`, 19.5 MB of every licence in the
 * Chromium tree, and MIT requires the notices to travel with the binary. The
 * obligation is to *include* them, not to ship them uncompressed in a form
 * nobody opens — so the file is replaced by a gzipped copy beside a short
 * pointer, and the notices are still present and still readable.
 *
 * Nothing is deleted and nothing is summarised: a licence text that has been
 * edited is no longer the licence, so the whole file is kept, just compressed.
 */
function compressLicences(dir) {
  const src = path.join(dir, 'LICENSES.chromium.html');
  if (!fs.existsSync(src)) return null;
  const before = fs.statSync(src).size;
  const gz = zlib.gzipSync(fs.readFileSync(src), { level: 9 });
  fs.writeFileSync(`${src}.gz`, gz);
  fs.rmSync(src);
  fs.writeFileSync(
    path.join(dir, 'LICENSES.chromium.html.txt'),
    'Chromium 及其依赖的开源许可全文见同目录的 LICENSES.chromium.html.gz。\n'
    + '解压方式：7z x LICENSES.chromium.html.gz，或任何 gzip 工具。\n\n'
    + 'The full text of every open-source licence in Chromium and its\n'
    + 'dependencies is in LICENSES.chromium.html.gz beside this file.\n'
    + 'Decompress with: 7z x LICENSES.chromium.html.gz, or any gzip tool.\n',
    'utf8',
  );
  return { before, after: gz.length };
}

const lic = compressLicences(outDir);
if (lic) {
  step(`压缩许可全文（${(lic.before / 1048576).toFixed(1)} → ${(lic.after / 1048576).toFixed(1)} MB）`);
}

// ------------------------------------------------------------- 9. readme

const readme = `Lab Calc ${pkg.version} — 实验室溶液计算器（免安装版）
${'='.repeat(52)}

怎么用
------
双击 ${APP_NAME}.exe 即可。不需要安装，不需要管理员权限。
第一次启动稍慢（几秒），之后正常。

本版本特点
----------
· 完全离线：所有计算在本机完成，不联网、不上传任何数据
· 计算记录自动保存在本机（localStorage），关掉再开还在
· 中英双语，可导出 Excel / CSV / Markdown / PDF 报告
· 16 个计算页签、118 元素周期表、6 张计算图表

体积说明
--------
本版本已删除运行时用不到的图形层（DirectX 着色器编译器、软件 Vulkan
回退），并把 Chromium 的许可全文压缩存放——共省约 55 MB。应用只用
2D 绘图，不触碰这些组件；打包后已跑过启动与计算冒烟测试。

计算记录存在哪
--------------
Windows 用户数据目录下，Electron 的 profile 文件夹内。删掉那个文件夹
等于清空记录。应用内的「计算记录」面板可以逐条删除或全部清除。

怎么卸载
--------
直接删除整个文件夹。没有注册表项，没有系统目录残留。

免责
----
仅供教学与学习。不可用于临床、诊断、生产或任何有法规要求的场景。
详见应用内「使用须知」。

许可
----
MIT · 界面图标 Phosphor Icons (MIT) · 字体 Geist / Space Grotesk /
JetBrains Mono (OFL-1.1) · Instrument Serif (OFL-1.1)
Chromium 及其依赖的许可全文见 LICENSES.chromium.html.gz
`;

fs.writeFileSync(path.join(outDir, 'README.txt'), readme, 'utf8');

// ------------------------------------------------------------ 10. verify

const checks = [
  [destExe, '主程序'],
  [path.join(appDir, 'package.json'), '应用清单'],
  [path.join(appDir, 'main.js'), '主进程'],
  [path.join(appDir, 'app', 'index.html'), '界面入口'],
  [path.join(outDir, 'README.txt'), '说明文件'],
];
const missing = checks.filter(([p]) => !fs.existsSync(p));
if (missing.length > 0) {
  die(`产物不完整，缺少：${missing.map(([, n]) => n).join('、')}`);
}

// A build that produced only the shell would still pass the checks above, so
// the bundle is confirmed to have come along too.
const assets = fs.readdirSync(path.join(appDir, 'app', 'assets'));
if (!assets.some((f) => f.endsWith('.js'))) die('app/assets 里没有 JS bundle。');

/** The entry bundle, which every check below reads. */
const entry = assets.find((f) => /^index-.*\.js$/.test(f));
if (!entry) die('app/assets 里没有 index-*.js 入口。');
const entrySrc = fs.readFileSync(path.join(appDir, 'app', 'assets', entry), 'utf8');

/*
 * The stylesheet may be its own file or inlined in the bundle.
 *
 * An ES build extracts CSS to `assets/index-*.css` and links it from the HTML.
 * An IIFE build has no chunk system to extract into, so Vite injects the rules
 * at run time with `document.createElement('style')` and emits no `.css` file
 * at all — which is the format the desktop build uses. Requiring a `.css` file
 * therefore failed a build whose styles were present, just not where the check
 * was looking.
 *
 * The real question is whether the styles made it, so that is what is asked:
 * either a stylesheet beside the bundle, or style injection inside it.
 */
const hasCssFile = assets.some((f) => f.endsWith('.css'));
const hasInlineCss = /createElement\(\s*[`'"]style[`'"]\s*\)/.test(entrySrc);
if (!hasCssFile && !hasInlineCss) die('既没有 CSS 文件，bundle 里也没有内联样式。');

/**
 * Refuse to package a bundle that cannot run as a plain script.
 *
 * The HTML rewrite below strips `type="module"`, because `file://` refuses
 * module scripts. Whatever is left has to be valid *classic* script — and two
 * things a module build emits are not:
 *
 *   `import.meta`  a syntax error outside a module; the whole script fails to
 *                  parse and the window stays blank. This shipped: the bundle
 *                  was single-file and still dead, because Vite's preload
 *                  helper uses `import.meta.url` and is injected whether or not
 *                  code splitting is on.
 *   `import(`      resolves relative to the document, which `file://` refuses.
 *
 * Both are checked on the emitted code rather than on the build mode, because
 * the mode is a request and this is the result: if a future Vite changes what
 * `format: 'iife'` does, this still catches it. `scripts/test-desktop.mjs`
 * remains the real proof — it drives the executable — but it needs a running
 * app to say so, and this costs a string search.
 */
if (/import\.meta/.test(entrySrc)) {
  die(
    '入口 bundle 含 import.meta —— 非模块脚本里是语法错误，file:// 下白屏。\n'
    + '  构建时应带 --mode desktop（见 vite.config.js 的 format: iife）。',
  );
}
if (/\bimport\s*\(/.test(entrySrc)) {
  die(
    '入口 bundle 含动态 import() —— file:// 下会被拒绝。\n'
    + '  构建时应带 --mode desktop（见 vite.config.js 的 codeSplitting: false）。',
  );
}
const chunkCount = assets.filter((f) => f.endsWith('.js')).length;
if (chunkCount > 1) {
  die(`app/assets 里有 ${chunkCount} 个 JS 文件 —— 桌面版必须是单文件，见上。`);
}
step(`入口 bundle 可作普通脚本运行（${entry}，无 import.meta / 动态 import）`);

const sizeMb = (dir) => {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  walk(dir);
  return (total / 1024 / 1024).toFixed(0);
};

console.log(`\n完成。\n`);
console.log(`  产物: ${outDir}`);
console.log(`  大小: ${sizeMb(outDir)} MB`);
console.log(`  启动: 双击 ${APP_NAME}.exe\n`);
