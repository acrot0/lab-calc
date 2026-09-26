#!/usr/bin/env node
/**
 * Smoke-test a packaged desktop build over the Chrome DevTools Protocol.
 *
 * The desktop build differs from the browser build in exactly one way that
 * matters — the HTML was rewritten to run under `file://` — and that rewrite is
 * invisible to every test that runs against source. A `type="module"` script
 * silently becomes a blank window; a missing `defer` silently becomes a React
 * mount error. Both were real failures during development and neither was
 * caught by the unit suite.
 *
 * So this drives the actual packaged executable: launch it with a debugging
 * port, connect, and assert the app really rendered and really computes.
 *
 * Usage:
 *   node scripts/test-desktop.mjs                    # auto-detect the build
 *   node scripts/test-desktop.mjs --dir <path>       # test a specific build
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const PORT = 9223;

/** Newest packaged build under releases/, or an explicit --dir. */
function findBuild() {
  if (dirIdx !== -1) return path.resolve(args[dirIdx + 1]);
  const parent = path.resolve(ROOT, '..', 'releases');
  if (!fs.existsSync(parent)) return null;
  const builds = fs.readdirSync(parent)
    .filter((d) => /^labcalc-v/.test(d) && fs.existsSync(path.join(parent, d, 'LabCalc.exe')))
    .map((d) => ({ dir: path.join(parent, d), mtime: fs.statSync(path.join(parent, d)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return builds[0]?.dir ?? null;
}

const buildDir = findBuild();
if (!buildDir) {
  console.error('找不到打包产物。先跑 npm run package:desktop。');
  process.exit(1);
}
const exePath = path.join(buildDir, 'LabCalc.exe');
console.log(`测试: ${buildDir}\n`);

/**
 * Launch the app with a debugging port.
 *
 * ELECTRON_RUN_AS_NODE is deleted from the child environment deliberately: if
 * the parent shell has it set (this one does), Electron starts as a plain Node
 * process, never opens a window, and exits 0 — which looks exactly like a
 * broken build.
 */
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(exePath, [`--remote-debugging-port=${PORT}`], {
  cwd: buildDir,
  env,
  stdio: 'ignore',
  detached: false,
});

/** Poll the CDP endpoint until the page target is up. */
async function waitForTarget(timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page' && t.url.startsWith('file://'));
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

/**
 * Minimal CDP client: connect, evaluate one expression, return the value.
 *
 * Node 22 ships a global WebSocket, so no client library is needed — the whole
 * protocol surface used here is one method.
 */
async function evaluate(wsUrl, expression) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP 超时')), 15000);
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 1) {
        clearTimeout(timer);
        if (msg.result?.exceptionDetails) {
          reject(new Error(msg.result.exceptionDetails.text ?? '求值异常'));
        } else {
          resolve(msg.result?.result?.value);
        }
      }
    });
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
  });

  ws.close();
  return result;
}

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
};

try {
  const target = await waitForTarget();
  if (!target) throw new Error(`端口 ${PORT} 上没有出现页面目标 —— 应用没起来`);
  console.log(`  已连接: ${target.url.split('/').pop()}\n`);

  // --- the page actually rendered ---
  const dom = await evaluate(target.webSocketDebuggerUrl, `(() => ({
    title: document.title,
    rootChildren: document.getElementById('root')?.children.length ?? -1,
    tabs: document.querySelectorAll('button.tab').length,
    hasStyles: getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)',
    bg: getComputedStyle(document.body).backgroundColor,
    bodyLen: document.body.innerText.length,
  }))()`);

  check('页面标题正确', dom.title.includes('Lab Calc'), dom.title);
  check('React 已挂载', dom.rootChildren > 0, `#root 子节点 ${dom.rootChildren}`);
  /*
   * Read from the source rather than hardcoded.
   *
   * The count was written as 15 and went stale the moment a tab was added — a
   * passing build then reported a failure, which trains the reader to ignore
   * the check. Counting the tab files keeps the assertion about the thing that
   * matters (every tab reached the package) instead of about a number that has
   * to be maintained by hand.
   */
  const tabFiles = fs.readdirSync(path.join(ROOT, 'src', 'ui', 'tabs'))
    .filter((f) => f.endsWith('.jsx')).length;
  check(`${tabFiles} 个标签页都在`, dom.tabs === tabFiles, `${dom.tabs} 个`);
  check('样式已加载', dom.hasStyles, dom.bg);
  check('页面有内容', dom.bodyLen > 100, `${dom.bodyLen} 字符`);

  // --- a real calculation end to end ---
  const calc = await evaluate(target.webSocketDebuggerUrl, `(async () => {
    // Dismiss the first-run notice if it is showing.
    const ack = [...document.querySelectorAll('button')].find(b => b.textContent.includes('我已阅读'));
    if (ack) ack.click();
    await new Promise(r => setTimeout(r, 300));

    // The weigh tab is the default: NaCl, 0.5 M, 500 mL -> 14.61 g.
    const inputs = [...document.querySelectorAll('.card input')];
    const btn = document.querySelector('.card button.primary');
    if (!btn) return { error: '找不到计算按钮' };
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    const main = document.querySelector('.card .result .result-main')?.textContent?.trim() ?? '';
    return { result: main, expected: '14.61' };
  })()`);

  check('称量计算给出正确答案', calc.result?.startsWith(calc.expected), `得到 ${calc.result}（期望 ${calc.expected} g）`);

  // --- history persisted ---
  const hist = await evaluate(target.webSocketDebuggerUrl, `(() => {
    const raw = localStorage.getItem('lab-calc.history.v1');
    if (!raw) return { count: 0 };
    try { return { count: JSON.parse(raw).length }; } catch { return { count: -1 }; }
  })()`);

  check('计算记录已写入 localStorage', hist.count > 0, `${hist.count} 条`);

  // --- the desktop-specific rewrite actually took ---
  const html = fs.readFileSync(path.join(buildDir, 'resources', 'app', 'app', 'index.html'), 'utf8');
  check('脚本用 defer 而非 type=module', /<script defer/.test(html) && !/type="module"/.test(html));
  check('manifest link 已移除', !/rel="manifest"/.test(html));

  // --- external links cannot hijack the window (main-process policy) ---
  const nav = await evaluate(target.webSocketDebuggerUrl, `(() => {
    try { window.location.href = 'https://example.com'; return 'set'; }
    catch (e) { return 'threw: ' + e.message; }
  })()`);
  await new Promise((r) => setTimeout(r, 1200));
  const stillHere = await evaluate(target.webSocketDebuggerUrl, `location.href.startsWith('file://')`);
  check('外部导航被拦截', stillHere === true, `href 仍是本地文件`);
  void nav;
} catch (e) {
  check('测试执行', false, e.message);
} finally {
  child.kill();
  // Electron spawns helper processes; make sure none are left holding the
  // directory, which would break the next package run.
  await new Promise((r) => setTimeout(r, 1500));
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} 通过`);
if (failed.length > 0) {
  console.log(`\n失败项：`);
  for (const f of failed) console.log(`  · ${f.name}  ${f.detail}`);
  process.exit(1);
}
