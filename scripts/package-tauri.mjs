#!/usr/bin/env node
/**
 * Package the app with Tauri, alongside the Electron build.
 *
 * ## Why two desktop builds
 *
 * They answer different constraints and neither wins outright.
 *
 * Electron ships its own Chromium: 268 MB installed, ~100-150 MB resident, and
 * identical behaviour on every Windows machine because the engine travels with
 * the app. Tauri uses the WebView2 runtime Windows 11 already has: an installer
 * of a few MB and a fraction of the memory, at the cost of depending on a
 * system component that can be updated out from under it.
 *
 * For an app whose whole premise is "it works on a lab bench with no network",
 * the smaller, faster one is the better default — and the larger one is the
 * fallback for a machine where WebView2 is missing or broken. Shipping both is
 * a few MB of build output; picking one and being wrong is a user who cannot
 * run the app.
 *
 * ## The environment Tauri will not find on its own
 *
 * `cargo` lives in `~/.cargo/bin`, which a fresh Git Bash session does not have
 * on its PATH — and `cargo` is not invoked directly but spawned by the Tauri
 * CLI, so a shell `export` in one terminal does not help the next. The path is
 * prepended here, and the failure it prevents is unhelpful: `failed to run
 * cargo metadata: program not found` reads like a broken Tauri install rather
 * than a PATH that needs one line.
 *
 * Usage:
 *   node scripts/package-tauri.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const step = (msg) => console.log(`  ${msg}`);
const die = (msg) => {
  console.error(`\n打包失败: ${msg}\n`);
  process.exit(1);
};

// --------------------------------------------------------- 1. environment

/**
 * Find cargo, and put it on the PATH of the child process.
 *
 * Probed rather than assumed: rustup installs to `~/.cargo/bin` by default but
 * honours `CARGO_HOME`, and a machine can have both.
 */
function findCargoBin() {
  const candidates = [
    process.env.CARGO_HOME ? path.join(process.env.CARGO_HOME, 'bin') : null,
    path.join(os.homedir(), '.cargo', 'bin'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'cargo.exe')) || fs.existsSync(path.join(c, 'cargo'))) return c;
  }
  return null;
}

const cargoBin = findCargoBin();
if (!cargoBin) {
  die(
    '找不到 cargo。装 Rust：https://rustup.rs\n'
    + '  Windows 上还需要 VS Build Tools 的 C++ 工作负载（MSVC 链接器）。',
  );
}
step(`cargo: ${cargoBin}`);

/*
 * The Rust toolchain has to be complete, not merely present.
 *
 * An interrupted `rustup` download leaves the directory and the `cargo` shim
 * in place but no manifest, and every build then fails with "missing manifest
 * in toolchain" — which is a five-minute fix and an hour of confusion if the
 * message is not read carefully. Checked here so the error names the cause.
 */
const toolchains = path.join(os.homedir(), '.rustup', 'toolchains');
if (fs.existsSync(toolchains)) {
  const stable = fs.readdirSync(toolchains).filter((d) => d.startsWith('stable-'));
  if (stable.length === 0) {
    die('rustup 里没有 stable 工具链。跑 rustup toolchain install stable。');
  }
  const hasManifest = stable.some((d) => fs.existsSync(path.join(toolchains, d, 'lib', 'rustlib')));
  if (!hasManifest) {
    die(
      `Rust 工具链不完整（${stable.join(', ')} 里没有 rustlib）——下载被中断过。\n`
      + '  修：rustup toolchain uninstall stable && rustup toolchain install stable',
    );
  }
}

const childEnv = {
  ...process.env,
  PATH: `${cargoBin}${path.delimiter}${process.env.PATH ?? ''}`,
};

// ------------------------------------------------------------- 2. build

step('构建并打包（首次编译 Rust 依赖需数分钟）…');
try {
  execFileSync('npx', ['tauri', 'build', '--bundles', 'nsis'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: childEnv,
  });
} catch (e) {
  die(
    'Tauri 构建失败。常见原因：\n'
    + '  · 缺 MSVC 链接器：装 VS Build Tools 的「使用 C++ 的桌面开发」工作负载\n'
    + '  · 首次构建需下载 crate，网络慢会失败（配 HTTPS_PROXY 后重试）\n'
    + `  · 原始错误见上方输出（exit ${e.status ?? '?'}）`,
  );
}

// ------------------------------------------------------------ 3. verify

/**
 * Locate the artefacts.
 *
 * The executable is named after the **crate**, not after `productName`: the
 * Cargo package is `lab-calc`, so the binary is `lab-calc.exe` even though the
 * window title and the installer say "Lab Calc". Composing the path from
 * `productName` finds nothing and reports a build that succeeded as incomplete.
 *
 * The installer's name carries the version, so the directory is searched rather
 * than a filename composed — that one would break on the next version bump.
 */
const releaseDir = path.join(ROOT, 'src-tauri', 'target', 'release');
const nsisDir = path.join(releaseDir, 'bundle', 'nsis');

const exeName = fs.readdirSync(releaseDir)
  .find((f) => f.endsWith('.exe') && !f.startsWith('build-script'));
const exe = exeName ? path.join(releaseDir, exeName) : null;

const installers = fs.existsSync(nsisDir)
  ? fs.readdirSync(nsisDir).filter((f) => f.endsWith('.exe'))
  : [];

if (!exe) die('target/release 里没有可执行文件 —— 构建可能没跑完。');
if (installers.length === 0) die('没有找到 NSIS 安装包。');

const mb = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1);
const installer = path.join(nsisDir, installers[0]);

/*
 * The exe is checked for size, not just existence.
 *
 * A Tauri binary that failed to embed the frontend still links and still runs —
 * it opens a window showing nothing, which is the same silent failure the
 * Electron build shipped once. A few MB is the floor for a WebView2 host with
 * an embedded bundle; anything much smaller means the assets are not in it.
 */
const exeMb = Number(mb(exe));
if (exeMb < 1) {
  die(`${path.basename(exe)} 只有 ${exeMb} MB —— 前端资源可能没打进去，会白屏。`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
console.log(`\n完成。\n`);
console.log(`  程序:   ${exe}（${exeMb} MB）`);
console.log(`  安装包: ${installer}（${mb(installer)} MB）`);
console.log(`  版本:   ${pkg.version}`);
console.log(`\n  与 Electron 版对比：Electron 268 MB / ~100-150 MB 内存，`);
console.log(`  Tauri 依赖系统 WebView2（Win11 自带），体积与内存都低一个数量级。\n`);
