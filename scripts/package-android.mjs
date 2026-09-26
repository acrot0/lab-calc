#!/usr/bin/env node
/**
 * Package the app as an Android APK.
 *
 * A hand-written script over the Capacitor + Gradle toolchain, for the same
 * reason `package-desktop.mjs` is hand-written over Electron's: the steps are
 * few and the toolchain's own wrappers add more configuration surface than the
 * work needs. What this does is set the environment Gradle expects, run the
 * build, and verify the artefact — the last part being the one that matters,
 * because a Gradle run that "succeeds" can still produce an APK that shows a
 * blank screen.
 *
 * ## The environment Gradle will not find on its own
 *
 * `JAVA_HOME` and `ANDROID_HOME` are read from the machine, not from the
 * repository, and neither is on the PATH of a fresh Git Bash session. Rather
 * than documenting two `export` lines that go stale, the script finds them and
 * says what it found. The JDK path is probed rather than hardcoded because
 * Eclipse Adoptium's directory name carries the full patch version and changes
 * with every update.
 *
 * Usage:
 *   node scripts/package-android.mjs             # build, sync, assemble
 *   node scripts/package-android.mjs --no-build  # reuse the existing dist/
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const NO_BUILD = args.includes('--no-build');

const step = (msg) => console.log(`  ${msg}`);
const die = (msg) => {
  console.error(`\n打包失败: ${msg}\n`);
  process.exit(1);
};

// --------------------------------------------------------- 1. environment

/**
 * Find a JDK.
 *
 * Capacitor 7's Gradle plugin needs JDK 17 or newer. The directory under
 * `Eclipse Adoptium` includes the patch version — `jdk-21.0.12.101-hotspot` —
 * so the newest match is taken rather than a fixed name, which would break on
 * the next JDK update.
 */
function findJdk() {
  const roots = [
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Microsoft',
  ];
  const found = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      if (!/^jdk/i.test(entry)) continue;
      const home = path.join(root, entry);
      if (fs.existsSync(path.join(home, 'bin', 'java.exe'))) found.push(home);
    }
  }
  if (found.length === 0) return null;
  // Newest first: the version is the first numeric run in the directory name.
  found.sort((a, b) => {
    const v = (s) => (/(\d+)/.exec(path.basename(s))?.[1] ?? '0');
    return Number(v(b)) - Number(v(a));
  });
  return found[0];
}

const JAVA_HOME = process.env.JAVA_HOME ?? findJdk();
if (!JAVA_HOME || !fs.existsSync(path.join(JAVA_HOME, 'bin', 'java.exe'))) {
  die(
    '找不到 JDK。装一个 JDK 17+（winget install EclipseAdoptium.Temurin.21.JDK），\n'
    + '  或设置 JAVA_HOME 指向它。',
  );
}
step(`JDK: ${JAVA_HOME}`);

/**
 * Find the Android SDK.
 *
 * The default install location, then the two environment variables Android's
 * own tools look at — in that order, because a stale variable pointing at a
 * deleted SDK is a common way to get a confusing "SDK not found" from Gradle
 * while a working SDK sits in the default place.
 */
function findSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'platform-tools'))) return c;
  }
  return null;
}

const ANDROID_HOME = findSdk();
if (!ANDROID_HOME) {
  die(
    '找不到 Android SDK。用 sdkmanager 装 platform-tools / platforms / build-tools，\n'
    + '  或设置 ANDROID_HOME 指向 SDK 根目录。',
  );
}
step(`Android SDK: ${ANDROID_HOME}`);

// ------------------------------------------------------------- 2. build

if (!NO_BUILD) {
  /*
   * `--mode desktop` for the same reason the Electron build uses it: a WebView
   * refuses module scripts over its local origin, and a split bundle dies on
   * its first dynamic `import()` with a blank screen. See vite.config.js.
   */
  step('构建前端（desktop 模式，单文件）…');
  execFileSync('npm', ['run', 'build', '--', '--mode', 'desktop'], {
    cwd: ROOT, stdio: 'inherit', shell: true,
  });
}

const distIndex = path.join(ROOT, 'dist', 'index.html');
if (!fs.existsSync(distIndex)) {
  die('dist/index.html 不存在。先跑 npm run build，或去掉 --no-build。');
}

/**
 * Refuse a bundle the WebView cannot run.
 *
 * The same two checks the desktop packager makes, for the same reason, and
 * duplicated rather than shared because the two scripts fail at different
 * points and a shared helper would have to be imported across a boundary that
 * otherwise does not exist. If this ever diverges from the desktop check, one
 * of the two platforms is broken and the other is fine — which is exactly the
 * state that is hard to notice.
 */
const distAssets = fs.readdirSync(path.join(ROOT, 'dist', 'assets'));
const entry = distAssets.find((f) => /^index-.*\.js$/.test(f));
if (!entry) die('dist/assets 里没有 index-*.js 入口。');
const entrySrc = fs.readFileSync(path.join(ROOT, 'dist', 'assets', entry), 'utf8');
if (/import\.meta/.test(entrySrc)) {
  die('入口 bundle 含 import.meta —— WebView 里是语法错误，会白屏。');
}
if (/\bimport\s*\(/.test(entrySrc)) {
  die('入口 bundle 含动态 import() —— WebView 里会被拒绝。');
}
step(`入口 bundle 可作普通脚本运行（${entry}）`);

// -------------------------------------------------------------- 3. sync

const androidDir = path.join(ROOT, 'android');
if (!fs.existsSync(androidDir)) {
  die('android/ 不存在。先跑 npx cap add android。');
}

step('同步到 Android 工程 …');
execFileSync('npx', ['cap', 'sync', 'android'], { cwd: ROOT, stdio: 'inherit', shell: true });

// ----------------------------------------------------------- 4. assemble

/*
 * The wrapper is invoked by bare name, with `cwd` set to the Android project.
 *
 * A full path cannot be used: this repository lives under `E:\trae ide data\`,
 * and with `shell: true` the space splits the path — the shell tries to run
 * `E:\trae` and reports "not recognized as an internal or external command",
 * which reads like a missing toolchain rather than an unquoted path. Running
 * `.\\gradlew.bat` from the project directory sidesteps quoting entirely.
 */
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
step('Gradle assembleDebug …');
try {
  /*
   * `-PappVersion` carries the repository's version into the APK. Without it
   * the build reports Capacitor's template value of 1.0 — a number that
   * appears nowhere else in the project, so the APK, the web app, the desktop
   * build and the release tag would all disagree.
   */
  execFileSync(gradlew, ['assembleDebug', '--no-daemon', `-PappVersion=${pkgVersion}`], {
    cwd: androidDir,
    stdio: 'inherit',
    shell: true,
    /*
     * The environment is passed through unchanged apart from the two variables
     * Gradle needs. A proxy is deliberately not injected: a machine that can
     * reach Maven Central directly should not be forced through one, and a
     * machine that cannot can set `HTTPS_PROXY` itself — Gradle honours it.
     */
    env: {
      ...process.env,
      JAVA_HOME,
      ANDROID_HOME,
      ANDROID_SDK_ROOT: ANDROID_HOME,
    },
  });
} catch (e) {
  die(
    'Gradle 构建失败。常见原因：\n'
    + '  · 首次运行需下载 Gradle 与依赖，网络慢会超时（已设 networkTimeout=120s）\n'
    + '  · 代理未配：设置 HTTPS_PROXY=http://127.0.0.1:7897 后重试\n'
    + `  · 原始错误见上方 Gradle 输出（exit ${e.status ?? '?'}）`,
  );
}

// ------------------------------------------------------------ 5. verify

/**
 * Locate the built APK.
 *
 * `assembleDebug` writes to a path that includes the variant name, and release
 * builds would land elsewhere. Searching for the file rather than composing the
 * path keeps this working if the variant changes, and a missing APK is the one
 * failure that must not be silent.
 */
function findApk(dir) {
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.apk')) hits.push(p);
    }
  };
  walk(dir);
  // Newest wins: a stale debug APK from an earlier run must not be reported.
  hits.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return hits[0] ?? null;
}

const apk = findApk(path.join(androidDir, 'app', 'build', 'outputs'));
if (!apk) die('Gradle 跑完了但没有找到 .apk —— 产物路径可能变了。');

const sizeMb = (fs.statSync(apk).size / 1024 / 1024).toFixed(1);
step(`APK: ${path.relative(ROOT, apk)}（${sizeMb} MB）`);

/*
 * An APK is a zip. Checking that it opens and contains the two files every
 * Android package must have catches a truncated or empty build, which Gradle
 * can report as success when a task is up-to-date from a previous failed run.
 */
const sevenZip = ['C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe']
  .find((c) => fs.existsSync(c));
if (sevenZip) {
  const listing = execFileSync(sevenZip, ['l', apk], { encoding: 'utf8' });
  for (const required of ['AndroidManifest.xml', 'classes.dex']) {
    if (!listing.includes(required)) die(`APK 里没有 ${required} —— 产物不完整。`);
  }
  /*
   * The web assets have to be inside, or the app installs and shows nothing —
   * a 4.6 MB APK of pure Android shell.
   *
   * Matched on a normalised path: 7-Zip lists zip entries with backslashes on
   * Windows, so a check written with forward slashes reports the file missing
   * when it is present. That warning fired on a correct build once.
   */
  const normalised = listing.replace(/\\/g, '/');
  if (!normalised.includes('assets/public/index.html')) {
    die('APK 里没有打包后的 index.html —— cap sync 没有把 dist 复制进去。');
  }
  step('APK 结构检查通过（AndroidManifest.xml / classes.dex / web 资源）');
} else {
  console.warn('  ! 没找到 7-Zip，跳过 APK 结构检查');
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
console.log(`\n完成。\n`);
console.log(`  APK:  ${apk}`);
console.log(`  大小: ${sizeMb} MB`);
console.log(`  版本: ${pkg.version}`);
console.log(`  安装: adb install "${apk}"，或把文件传到手机点击安装\n`);
