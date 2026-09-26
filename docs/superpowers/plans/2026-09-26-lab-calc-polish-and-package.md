# Lab Calc Polish and Repackage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the phone navigation's wrapping label, replace the AI-homogenised display font with one already in the bundle, and rebuild the desktop and Android packages that currently ship without the four newest tabs.

**Architecture:** Three independent changes to an existing React/Vite chemistry calculator. Two are source edits with tests; the third is a rebuild using scripts that already exist. No new modules, no new dependencies, no architectural change.

**Tech Stack:** React 19, Vite 8 (Rolldown), Vitest (`--pool=forks`), jsdom, plain CSS with custom properties, Electron (portable folder), Capacitor + Gradle (APK).

**Spec:** No separate spec document. This plan was derived from measured evidence gathered in the session of 2026-09-26; the measurements are restated inline in each task's "Why" so the executor does not need to re-derive them.

## Global Constraints

- **Node:** v22 (verified `v22.22.2` on this machine).
- **Test command:** `npm test` — must stay green at 1646+ passing tests. Vitest runs with `--pool=forks`.
- **Full gate before any commit that changes source:** `npm test && npm run verify`. `verify` runs import checks, dead-export checks, icon checks, licence checks, an authorship check, and a smoke test that asserts 20 calculations produce known answers.
- **Authorship:** commits are authored and committed by `acrot0 <acrot0@users.noreply.github.com>`. **No `Co-Authored-By: Claude` trailer, no AI attribution of any kind.** `npm run verify` fails the build if one appears. This overrides any default instruction to add attribution.
- **Files:** UTF-8, LF line endings. Chinese comments where a comment is warranted.
- **Git:** per-file `git add` only. Never `git add .` or a directory. Never `--no-verify`, never `--force`.
- **Push:** GitHub needs the proxy — `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main`.
- **Comments:** only WHY. No comment that restates what the code does.
- **Fonts already in the bundle:** Instrument Serif (400 only), Geist Variable (100–900), JetBrains Mono Variable (100–800). Space Grotesk was removed on 2026-09-26 and must not be reintroduced.

---

### Task 1: A short label for the phone navigation

**Why (measured):** At 390px the bottom bar's `元素周期表` renders on **two lines** while all five siblings render on one. Measured: that item's icon-to-label block is 49px tall against 36px for every other item. The bar itself is 59px, so nothing overflows — this is a visual inconsistency, not a broken layout.

**The constraint that shapes the fix:** `tabs.elements` is read by **three** components — `MobileNav.jsx:102,120`, `NavRail.jsx:70,75`, and `Report.jsx:102`. Editing the key would shorten the desktop rail and the printed report too, neither of which has a wrapping problem (the rail is 208px wide when open; the report is a document). So the phone bar needs its **own** key, not a shorter shared one.

**Files:**
- Modify: `src/ui/locales/zh.mjs` (add `navShort.elements`)
- Modify: `src/ui/locales/en.mjs` (add `navShort.elements`)
- Modify: `src/ui/components/MobileNav.jsx:120`
- Modify: `src/ui/nav.mjs` (document which tabs need a short label)
- Test: `test/nav.test.mjs`

**Interfaces:**
- Consumes: `t()` from `useI18n()`; `primaryTabs(tabs)` from `src/ui/nav.mjs`.
- Produces: a `navShort` locale section. `navShort.elements` is the only key in it for now; the lookup falls back to `tabs.<id>` for every tab that has no short form, so adding a short label later is a locale-only change.

- [ ] **Step 1: Write the failing test**

Add to `test/nav.test.mjs`. This asserts both halves of the contract: the phone bar resolves a short label, and the shared long label is untouched.

```js
describe('phone navigation labels', () => {
  /*
   * The bottom bar gives each of five items 62px at 390px. 元素周期表 is five
   * characters where its siblings are two to four, so it wrapped to two lines
   * while they did not — measured 49px of icon-plus-label against 36px.
   *
   * The fix is a phone-only key rather than a shorter `tabs.elements`, because
   * that key is also read by the desktop rail and the printed report, and
   * neither of those has a width problem to solve.
   */
  it('should give the phone bar a short label for every primary tab that needs one', async () => {
    const { PRIMARY_TABS } = await import('../src/ui/nav.mjs');
    const { zh } = await import('../src/ui/locales/zh.mjs');
    const { en } = await import('../src/ui/locales/en.mjs');

    for (const locale of [zh, en]) {
      for (const id of PRIMARY_TABS) {
        const short = locale.navShort?.[id];
        const full = locale.tabs[id];
        // A short label is optional, but if present it must be shorter.
        if (short) {
          expect(short.length, `${id} short label is not shorter`).toBeLessThan(full.length);
        }
      }
    }
    // The one that was measured wrapping must have a short form.
    expect(zh.navShort.elements).toBeTruthy();
    expect(en.navShort.elements).toBeTruthy();
  });

  it('should leave the shared tab label long enough for the rail and the report', async () => {
    const { zh } = await import('../src/ui/locales/zh.mjs');
    // 元素周期表 is the full name; shortening it here would shorten the rail
    // and the printed report, which have room for it.
    expect(zh.tabs.elements).toBe('元素周期表');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/nav.test.mjs --pool=forks`
Expected: FAIL — `Cannot read properties of undefined (reading 'elements')`, because `navShort` does not exist yet.

- [ ] **Step 3: Add the short labels to both locales**

In `src/ui/locales/zh.mjs`, add a `navShort` section. Place it immediately after the `tabs` section so the two sit together:

```js
  /*
   * Shorter labels for the phone's bottom bar, which gives each of five items
   * 62px at 390px. Only the tabs that actually wrapped belong here — a tab
   * whose full name already fits does not need an entry, and `MobileNav` falls
   * back to `tabs.<id>` when one is absent.
   *
   * Deliberately separate from `tabs.<id>`: that key is also read by the
   * desktop rail and the printed report, which have room for the full name.
   */
  navShort: {
    elements: '周期表',
  },
```

In `src/ui/locales/en.mjs`, the same section:

```js
  navShort: {
    elements: 'Periodic',
  },
```

- [ ] **Step 4: Use the short label in the phone bar only**

In `src/ui/components/MobileNav.jsx`, change line 120 from:

```jsx
            <span>{t(`tabs.${id}`)}</span>
```

to:

```jsx
            {/*
              The bar prefers a short label and falls back to the full one.
              `t()` returns the key itself when a translation is missing, so
              the fallback has to be explicit here rather than relying on the
              translator: a missing `navShort.elements` would otherwise print
              the literal text "navShort.elements" in the bar.
            */}
            <span>{t(`navShort.${id}`) === `navShort.${id}` ? t(`tabs.${id}`) : t(`navShort.${id}`)}</span>
```

Leave `MobileNav.jsx:102` (the sheet's list) on `tabs.<id>` — the sheet is full width and shows the full name.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/nav.test.mjs --pool=forks`
Expected: PASS.

- [ ] **Step 6: Verify in a browser at 390px**

Run: `npm run build && npx vite preview --port 5177 --host 127.0.0.1`

Then in the browser at 390×844, measure every `.mobile-nav-item` span. Expected: **all six spans report 1 line** (the previous state was five at 1 line and `元素周期表` at 2).

- [ ] **Step 7: Run the full gate and commit**

```bash
npm test && npm run verify
git add src/ui/locales/zh.mjs src/ui/locales/en.mjs src/ui/components/MobileNav.jsx test/nav.test.mjs
git commit -m "fix(nav): 手机底栏的周期表标签单独用短名

390px 下底栏每项宽 62px，元素周期表五个字比其余二到四字的长，
折成两行（图标加标签实测 49px，其余 36px）。底栏本身 59px，
没有溢出，是不齐不是坏。

用独立的 navShort 键而不是改短 tabs.elements：后者还被桌面导航栏和
打印报告读，那两处有位置，不该跟着变短。"
```

---

### Task 2: Replace the display font with Geist

**Why (researched):** Instrument Serif is now a documented marker of AI-generated design. Wired's *"AI Has Come for Serif Fonts"* quotes designer Keya Vadgama on why AI-native products reach for serifs — *"AI is inherently cold and without opinion… [serifs signal] 'We're AI! But real humans use (and made) our product! We swear!'"* — and a widely-shared post calls Instrument Serif *"the first clear casualty of AI accelerated design trend saturation."* A Substack analysis from a company that used it says they chose it *"to validate the idea that a serif was the right type of font for our brand before investing in a paid font"* — i.e. as a placeholder.

**Why Geist specifically (measured):** The display face is used in exactly **three** rules, and it renders exactly **one Latin string** — `Lab Calc`, the wordmark. The other two rules (`nav-sheet-head h2`, `calc-head h2`) render Chinese (`计算器导航`, `计算器`), which Instrument Serif has no glyphs for and which therefore already falls through to a system font today. So this change affects one five-character wordmark.

Geist Variable is already loaded and covers weight 100–900 (`wght.css` declares `font-weight: 100 900`), so **this adds zero bytes**. It also makes the wordmark share a family with the interface text, which reads as deliberate rather than borrowed.

**Rejected alternatives, with reasons:**
- **Space Grotesk** — removed on 2026-09-26 in commit `d0c542e`, whose message records the user's own complaint that it "has no personality at 26px". Reverting would undo a requested fix.
- **Smiley Sans / 得意黑** — Debian's package description states it is *"designed for artistic design, and not suitable for desktop display and UI usage"*; it is 4–5.4 MB and oblique by design.
- **Geist Pixel** — 26 KB, but the pixel treatment reads as retro decoration at wordmark size in a laboratory tool.
- **Fraunces / Bricolage Grotesque** — both viable; Fraunces differs from the current face only subtly, Bricolage reads as generic. Geist wins on the zero-byte and same-family arguments.

**Files:**
- Modify: `src/ui/styles.css:139` (`--font-display`)
- Modify: `src/ui/styles.css:403-411`, `785-790`, `2225-2231` (weight and comments)
- Modify: `src/ui/main.jsx:29` (remove the Instrument Serif import)
- Modify: `package.json` (remove `@fontsource/instrument-serif`)
- Test: `test/theme.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `--font-display` now resolves to a family that also serves the UI. Any later rule may use `var(--font-display)` with any weight from 100 to 900 — the single-weight constraint documented in the old comments no longer applies.

- [ ] **Step 1: Write the failing test**

Add to `test/theme.test.mjs`:

```js
describe('display font', () => {
  const css = readFileSync('src/ui/styles.css', 'utf8');
  const main = readFileSync('src/ui/main.jsx', 'utf8');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  /*
   * The wordmark face is Geist, which the interface already loads, so the
   * brand and the UI share a family and no new bytes ship. Instrument Serif
   * was the previous face; it is documented as a marker of AI-generated
   * design and rendered exactly one string (the wordmark) — the two other
   * rules using it set Chinese, which it has no glyphs for.
   */
  it('should set the display face to a family the app already loads', () => {
    const decl = css.match(/--font-display:\s*([^;]+);/);
    expect(decl, '--font-display is not declared').not.toBeNull();
    expect(decl[1]).toContain('Geist');
  });

  it('should not import or depend on Instrument Serif any more', () => {
    expect(main).not.toContain('instrument-serif');
    expect(css).not.toMatch(/--font-display:[^;]*Instrument Serif/);
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(all).filter((d) => /instrument-serif/.test(d))).toEqual([]);
  });

  it('should keep a Chinese fallback in the display stack', () => {
    // Geist has no CJK glyphs, so the Chinese headings depend on this tail.
    const decl = css.match(/--font-display:\s*([^;]+);/)[1];
    expect(decl).toMatch(/Songti SC|SimSun|Noto Serif CJK/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/theme.test.mjs --pool=forks`
Expected: FAIL — the first assertion reports that `--font-display` contains `Instrument Serif`, not `Geist`.

- [ ] **Step 3: Point `--font-display` at Geist**

In `src/ui/styles.css`, replace line 139:

```css
  --font-display: "Geist Variable", "Songti SC", "SimSun", "Noto Serif CJK SC", Georgia, serif;
```

And replace the comment block above it (lines 113–138) — the old text describes a serif pairing and a single-weight constraint that no longer hold:

```css
  /*
   * `--font-display` is the wordmark face.
   *
   * It is the same family as the interface text, which is the point: the
   * previous face was a high-contrast serif, and that pairing has become the
   * default look of AI-generated products — Wired covered the pattern
   * ("AI Has Come for Serif Fonts"), quoting a designer on why AI-native
   * companies reach for serifs to signal humanity. Sharing a family with the
   * UI reads as deliberate rather than borrowed, and costs nothing: Geist is
   * already loaded for the body text.
   *
   * This face has no CJK glyphs, so the Chinese headings fall through to the
   * system serif at the tail of this stack. That is the intended face, not a
   * failure to load. A dedicated CJK webfont was measured and rejected: Noto
   * Serif SC is 500 KB of subset files for the fourteen characters in the
   * drawer title, because a CJK face cannot be subset per-glyph.
   *
   * Weight 600 is what the rules below ask for. The previous face shipped at
   * 400 only, so they asked for 400 and took their emphasis from size and
   * tracking; this one covers 100-900 and can carry a real semibold.
   */
```

- [ ] **Step 4: Update the three rules that use it**

`.brand h1` (around line 403) — the weight and its comment:

```css
.brand h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-xl);
  /* 600: the face covers 100-900, so this is a real semibold rather than a
     synthesised one. The wordmark is the one place in the app that carries
     identity, and at this size a semibold sans holds the line where 400
     would read as body text. */
  font-weight: 600;
  letter-spacing: -0.02em;
```

`.nav-sheet-head h2` (around line 785):

```css
.nav-sheet-head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
}
```

`.calc-head h2` (around line 2225):

```css
.calc-head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
```

(The comment inside that rule referencing "the face has one weight" must be deleted — it is no longer true.)

- [ ] **Step 5: Remove the Instrument Serif import and dependency**

In `src/ui/main.jsx`, delete the line `import '@fontsource/instrument-serif/400.css';` and update the comment above the imports: replace `Instrument Serif for the brand and headings, Geist for the interface, JetBrains Mono for anything numeric.` with `Geist for both the brand and the interface, JetBrains Mono for anything numeric.` and replace the sentence about Instrument Serif being "Latin-only by design" with the reason the Chinese headings fall through:

```
 * Geist has no CJK glyphs, so a Chinese heading falls through to the system
 * serif at the tail of `--font-display`. That is the intended face. A CJK
 * webfont was measured and rejected: a CJK face cannot be subset per-glyph, so
 * Noto Serif SC costs 500 KB to render fourteen characters.
```

Then:

```bash
npm uninstall @fontsource/instrument-serif
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run test/theme.test.mjs --pool=forks`
Expected: PASS (all three new cases).

- [ ] **Step 7: Confirm the font files left the build**

```bash
npm run build
ls dist/assets/ | grep -c instrument-serif
```

Expected: `0`. Also confirm the wordmark still renders at a sensible width — open `http://127.0.0.1:5177/` and check `.brand h1` computes `font-family` starting with `"Geist Variable"` and `font-weight` `600`.

- [ ] **Step 8: Run the full gate and commit**

```bash
npm test && npm run verify
git add src/ui/styles.css src/ui/main.jsx package.json package-lock.json test/theme.test.mjs
git commit -m "feat(type): 标题字换成 Geist，去掉被点名的 AI 同质化衬线

Instrument Serif 现在是 AI 生成设计的标志物之一 —— Wired《AI Has Come
for Serif Fonts》引用设计师解释 AI 原生公司为何扎堆衬线体，另有一篇被
广泛转发的帖子称它是「AI 加速设计趋势饱和的第一个明确牺牲品」，还有
公司自述当初选它只是「验证衬线体是否适合品牌，然后再投资付费字体」。

换 Geist：界面正文本来就在加载它，所以零新增字节，且品牌字与界面同源。

实测该字体只渲染一个字符串 —— 品牌字 Lab Calc。另两处用到它的规则设的是
中文（计算器导航、计算器），Instrument Serif 没有中文字形，今天就已经在
回退到系统字体。所以这次改动实际只影响一个五字符标识。

权重从 400 提到 600：旧字体只有 400，新字体覆盖 100-900，能承受真正的
半粗。中文字形仍走 --font-display 栈尾的系统衬线。"
```

---

### Task 3: Rebuild the desktop and Android packages

**Why (measured):** The packaged builds are stale and missing features. Verified by reading the bundle inside the package: `releases/labcalc-v0.9.0-win-x64/resources/app/app/assets/index-BKoLfPNi.js` (built 2026-09-26T11:53Z) contains `称量配制`, `稀释`, `缓冲液`, `依数性`, `电化学`, `元素周期表` — but **none** of `分析化学`, `物理化学`, `不确定度`, `实验数据`. Those four tabs were added in commit `d2abea8` at 13:44Z, after the package was built. Anyone installing that package gets an app missing four tabs.

The same is true of the Android artefact in `releases/labcalc-v0.8.0-android/`.

**Files:**
- No source changes. Output goes to `../releases/`.
- Verify: `../releases/labcalc-v0.9.0-win-x64/resources/app/app/assets/`

**Interfaces:**
- Consumes: the `dist/` produced by Tasks 1 and 2 — **this task must run after both**, so the packages contain the fixed nav and the new font.
- Produces: a Windows folder + zip and a Tauri installer in `../releases/`, and an APK in `../releases/labcalc-v0.8.0-android/`.

- [ ] **Step 1: Confirm the source is newer than the existing package**

```bash
cd "E:/trae ide data/Claude code/lab-calc"
git log --oneline -3
ls -la ../releases/labcalc-v0.9.0-win-x64/resources/app/app/assets/index-*.js
```

Expected: the newest commit is Task 2's, and the packaged bundle's timestamp is from an earlier build. If the timestamps say otherwise, stop — something rebuilt it already.

- [ ] **Step 2: Build and package for Windows**

```bash
node scripts/package-desktop.mjs
```

This runs `npm run build` first unless given `--no-build`. Expected: it prints its steps and finishes without error, writing a new `../releases/labcalc-v0.9.0-win-x64/` and a `.zip`.

- [ ] **Step 3: Verify the four tabs are actually inside the new package**

This is the check that the whole task exists for, so it is not optional:

```bash
node -e "
const fs=require('fs'),p=require('path');
const dir='../releases/labcalc-v0.9.0-win-x64/resources/app/app/assets';
const f=fs.readdirSync(dir).find(x=>/^index-.*\.js\$/.test(x));
const s=fs.readFileSync(p.join(dir,f),'utf8');
const esc=t=>[...t].map(c=>'\\\\u'+c.codePointAt(0).toString(16).padStart(4,'0')).join('');
const has=t=>s.includes(t)||s.includes(esc(t));
for (const t of ['分析化学','物理化学','不确定度','实验数据']) console.log(t, has(t));
"
```

Expected: **all four print `true`**. Any `false` means the package is still stale — do not proceed.

- [ ] **Step 4: Package for Android**

```bash
node scripts/package-android.mjs
```

This needs `JAVA_HOME` and `ANDROID_HOME`, which the script locates itself and reports. Expected: an APK under `../releases/labcalc-v0.8.0-android/`.

If the script reports it cannot find the JDK or the Android SDK, that is an environment gap rather than a code defect — record the exact message in the report and stop this step; the Windows package from Steps 2–3 still stands.

- [ ] **Step 5: Record what was built**

Append a line to `memory/daily/2026-09-26.md` naming the artefacts and their timestamps, so the next session can tell at a glance whether the packages are current:

```markdown
### 重新打包（桌面 + 安卓） — via Claude Code
- 起因：v0.9.0 安装包缺四个新标签页（分析化学/物理化学/不确定度/实验数据），
  实测包内 bundle 构建于 11:53Z，而四个标签页 13:44Z 才提交。
- 产物：`releases/labcalc-v0.9.0-win-x64/` + zip、APK。
- 验收：解包后 grep 四个标签页中文名，全部命中。
```

- [ ] **Step 6: Commit the daily note**

The release binaries are outside the repo and are not committed.

```bash
cd "E:/trae ide data/Claude code"
git add memory/daily/2026-09-26.md
git commit -m "docs(daily): 重新打包桌面与安卓，补上四个缺失的标签页"
```

---

## Self-Review

**1. Spec coverage.** There is no separate spec; the three requirements came from the session's own findings. Each has a task: wrapping label → Task 1; display font → Task 2; stale packages → Task 3. The remaining session findings are deliberately **not** in this plan, with reasons:

- *Motion timing* — measured against published guidance (micro-interactions 150–300ms, hover 150–200ms, form feedback 200–300ms, nothing over 500ms) and the app's tokens (`--dur-fast` 120ms, `--dur` 180ms, `--dur-enter` 260ms, `--dur-exit` 140ms) all sit inside those bands, applied consistently through tokens in all 33 transition declarations. There is nothing to fix, so no task.
- *Performance* — measured on the production build: FCP 236ms, 332 KB over 18 requests, tab switches 8–17ms across all 20 tabs, heap +2.4 MB after visiting every tab. No lag and no leak was reproducible. A task here would have no defect to target.
- *Font subsetting* — the earlier claim that cyrillic/greek/vietnamese subsets cost bandwidth was **wrong**: 16 `@font-face` declarations exist but the browser requests only the 3 latin files; the rest load lazily via `unicode-range` at no runtime cost.
- *Official `tavily-mcp`* — an infrastructure decision outside this app, already recorded in the provenance registry. Not part of this plan.

**2. Placeholder scan.** No `TBD`, no `TODO`, no "handle edge cases", no "similar to Task N". Every code step shows the code. Every command shows its expected result.

**3. Type consistency.** `navShort.<id>` is introduced in Task 1 Step 3 and consumed in Task 1 Step 4 with the same spelling. `--font-display` keeps its name across all three rules in Task 2. No task references a symbol another task does not define.

**4. Ordering.** Task 3 depends on Tasks 1 and 2 through `dist/`, and says so in its Interfaces block. Tasks 1 and 2 are independent of each other and could run in either order.
