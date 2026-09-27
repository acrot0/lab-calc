# 总规划 —— lab-calc 认知重启与全面返工

> 写于 2026-09-27。本文档回答一个问题：**这些吐槽，哪些是真的、根因在哪、按什么顺序修。**
>
> 与 `NEXT-SESSION.md` 的区别：那份是交接清单（要做什么），这份是**实测诊断 + 决策**（为什么、怎么做、做完长什么样）。两者互补，本文档是上位。
>
> **所有「实测」均为本次会话在打包后的真实可执行文件上跑出来的，不是读代码推断。**

---

## 0. 一句话结论

七条吐槽里，**六条有实测根因、一条我无法复现**。最严重的不是界面丑，是**桌面版有一个已证实可触发的白屏缺陷 + 三端都没有可用的更新通道**——用户装了 0.9.0 就永远停在 0.9.0，而下一个版本一旦触发白屏，用户**没有任何手段自救**。这必须先修。

### 0.1 吐槽逐条判定

| 吐槽 | 判定 | 一句话依据 |
|---|---|---|
| 单位该显示中文 | ✅ **成立** | 实测单位下拉 15 项全是符号，一个中文都没有 |
| 数值覆盖不进输入框 | ❓ **无法复现** | 实测 `填入字段` 成功（`1` → `2.5`）；需补操作路径 |
| 桌面关闭再打开加载不出来 | ✅ **成立，机制已证实** | 埋过期 shell 进缓存 → 重启后 `rootChildren: 0` |
| 界面丑 / 副标题多余 / 布局丑 / 字体丑 | ✅ **成立** | 副标题占顶栏 1/3；h1 是 AI 同质化字体 + 中文回退系统衬线 |
| 图标没创意、没用好架构优势 | ✅ **成立** | 画的是烧瓶（化学题材默认值），而差异点是「记录」 |
| 动效只是象征性加的 | ✅ **成立** | 5 个 keyframes **全是入场动画**，交互过渡为零 |
| 主题多但换汤不换药 | ✅ **成立** | 11 套主题**只覆盖颜色**，无自定义 token 入口 |
| 计算不够精确、受限大 | ✅ **成立，已补齐** | 缓冲容量 / 等当点两法 / 完整回归报告 / Ksp 与络合平衡**均已落地**（见 §4 P1-2）|
| 新功能没有计算过程 | ✅ **成立** | 6 个页签 `worked` 计数 = **0**，正是最新那批功能 |
| 应该能定义实验号 / 用途 | ✅ **成立** | 无分组、无备注字段、无自定义字段 |
| 记录不够准 / 要能消除误差 | ✅ **成立** | 删除即消失（ALCOA「Original」缺口）；结果不带不确定度 |
| 导出格式少 / 不支持自定义 | ✅ **成立** | 列不可选；无一字段一列之外的模式 |
| 导出排版特别大 | ✅ **成立，已量到** | 3 条记录就 412 字符宽，超 1920px 屏 72% |
| 导出没有注释、没有说明 | ❌ **不成立** | `toMetaRows()` 已写说明 sheet（软件/版本/时间/字段来源/免责）。**缺的是「模型局限」那一段**，不是整个说明 |
| GitHub 宣传乱、Latest 指错 | ✅ **成立** | Latest 标记在 **v0.4.0** 上（落后 5 个版本）；README 测试数 1369（实际 1650） |

**三处「不成立 / 待复现」我没有粉饰。** 其中「没有说明」是真的有说明——这条若照做会重写一个已经存在的功能。**先核对，再动手。**

---

## 1. 实测证据（本次会话做了什么）

不是读代码，是驱动真程序。工具落在 `.tmp/diag/`，建议保留为 `scripts/diag/`。

| 脚本 | 干什么 | 用途 |
|---|---|---|
| `.tmp/diag/relaunch-probe.mjs` | 启动 → 强杀 → 再启动 ×3 | 复现「关闭再打开」 |
| `.tmp/diag/graceful-probe.mjs` | 启动 → `window.close()` → 再启动 | 复现「正常关闭后」 |
| `.tmp/diag/sw-probe.mjs` | 读运行中页面的 SW/CacheStorage 状态 | 定位白屏机制 |
| `.tmp/diag/sw-stale-probe.mjs` | **往缓存里埋过期 shell，重启看是否被端上来** | **决定性证据** |
| `.tmp/diag/desktop-measure.mjs` | 读打包产物的计算样式与下拉框选项 | 量「单位中文名」「数字装不进框」 |
| `.tmp/diag/export-measure.mjs` | 复算 `widthsFor` 的输出宽度 | 量「导出排版特别大」 |
| `.tmp/diag/dom-dump.mjs` | 导出渲染后的 DOM | 排除「其实没渲染」 |
| `.tmp/diag/tauri-probe.mjs` | WebView2 上跑同一套 | 证明 Tauri 与 Electron 行为分叉 |

### 1.1 关键实测数据

**打包产物（Electron 0.9.0，视口 1226×824，dpr 1.5）**

```
输入框        h=40px  line-height=23.2px  font-size=14.5px  padding=0 12px
              box-sizing=border-box  border=0.67px  font=Geist Variable
h1 字体       "Instrument Serif", "Songti SC", SimSun, ...   size=26px
顶栏 tagline  11.5px  h=18px  w=241px
              文本："实验室溶液计算 · 每次计算自动留存，随时可查"
顶栏总高      67px
```

**单位换算下拉框（同一页面）**

```
维度下拉    35 项，全部中文："质量"、"体积"、"物质的量" …
单位下拉    15 项，全部英文符号："kg","g","mg","ug","ng","pg","fg","t","lb","oz" …
是否含中文  false        ← 一个中文都没有
```

**服务 worker 与缓存**

```
Electron (file://)                     Tauri (http://tauri.localhost)
  hasSWApi : true                        hasSWApi : true
  regs     : 0        ← 没注册          regs     : 1      ← 注册了
  controller: null                       controller: sw.js
  cacheKeys: 6 个 lab-calc-* 残留         cacheKeys: 1 个
```

**决定性实验（`sw-stale-probe.mjs`）**

```
第一次启动：埋入过期 index.html 到 CacheStorage
第二次启动：bodyText = "STALE-MARKER-ACTIVE"
            rootChildren = 0          ← 空壳，白屏
```

**计算过程（`worked`）覆盖**

```
有：Bio 27 · Reagent 17 · Lab 15 · Reaction 14 · Buffer 11 · Colligative 11
    Ph 10 · Spectro 10 · Weigh 10 · Percent 8 · Curve 7 · Dilute 7
    Electro 6 · Series 6
无：Analytical 0 · Convert 0 · Elements 0 · Physical 0 · Stats 0 · Uncertainty 0
```

---

## 2. 缺陷清单（按严重度）

严重度定义：**S0** = 用户数据/功能不可用；**S1** = 用户会因此弃用；**S2** = 体验缺陷；**S3** = 打磨项。

### S0-1　桌面版白屏：已证实可触发

**症状**：关闭再打开，加载不出来。用户描述与实测机制吻合。

**根因**：Tauri 从 `http://tauri.localhost` 提供页面，这是一个**真实的 HTTP 源**，所以 service worker **真的注册了**（实测 `regs: 1`）。而 `public/sw.js` 的导航处理是：

```js
fetch(request)
  .then(...)
  .catch(() => caches.match(request).then(hit => hit ?? caches.match('./index.html')))
```

那个 `catch` 会端出**安装时缓存的 index.html**。该文件引用的是**那次构建**的哈希资源名。只要 worker 内的 fetch 失败一次（协议处理器冷启动未就绪、资源在版本间改名），端上来的是一个指向**已经不存在的文件**的壳 → 白屏，且**重启无效**（缓存是持久的）。

**为什么现在没大面积爆**：默认路径上 fetch 都成功。所以这是**潜伏缺陷**，会在**下一次升级时集中爆发**——正好是最需要更新通道的时刻。

**打包脚本注释是错的**。`scripts/package-desktop.mjs` 写着「service worker 注册在这里没有意义：`navigator.serviceWorker` 在 file:// 下不可用」。这句对 Electron 成立（实测 `regs:0`），**对 Tauri 不成立**（实测 `regs:1`）。Tauri 打包脚本没有做对应处理。**这是一处基于错误事实的设计决定。**

**旁证**：Electron 的 userData 里躺着 6 个 `lab-calc-<构建号>` 缓存，全部 `cachedCount: 0`。是历史遗留，说明这条路径以前跑通过。

### S0-2　三端都没有可用的更新通道

| 端 | 现状（实测） | 后果 |
|---|---|---|
| 网页 | SW `network-first` + 版本化缓存名 | ✅ 能自动更新，**不用动** |
| Tauri | 无 updater 插件、无签名密钥、无 `latest.json` | ❌ 装了就不动 |
| Electron | 只有「关于」显示版本号 | ❌ 决定弃用 |
| Android | `versionCode` **写死为 1**（`android/app/build.gradle:10`） | ❌ **系统会拒绝安装"更新"** |

安卓这条是**真 bug 不只是缺功能**：`versionCode` 不变，Android 认为新包不比旧包新，直接拒绝。用户连手动覆盖安装都做不到。

**与 S0-1 的耦合**：用户装了 0.9.0，若 1.0.0 触发白屏，用户**既看不到更新提示、也装不上、也没有回退手段**。三条路同时堵死。

### S1-1　计算的「过程」有 6 个页签完全缺失

**这个「0」正好落在最新加的那批功能上** —— 不确定度、实验数据、分析化学、物理化学，以及单位换算。所以「别人问是不是要放弃了」的感受是准确的：**不是放弃了，是从来没做**。

### S1-2　单位换算不显示中文名

`src/ui/components/UnitConverter.jsx:158`：

```jsx
{units.map((u) => <option key={u} value={u}>{u}</option>)}
```

只渲染符号。而**数据层早就准备好了**——`src/calc/data/dimensions.mjs` 每个单位都带名字：

```js
{ sym: 'g',  factor: 1e-3, name: { zh: '克',   en: 'gram' } },
{ sym: 'mg', factor: 1e-6, name: { zh: '毫克', en: 'milligram' } },
```

**维度下拉显示中文（"质量"），单位下拉显示符号（"g"）——同一张卡片里两套语言。** 用户看到的就是这个不一致。

### S1-3　记录功能不满足 ELN 基本要求

| ALCOA 原则 | 现状 | 缺口 |
|---|---|---|
| Attributable | ❌ 无用户字段 | 单人本地应用，可接受 |
| Legible | ✅ 5 种导出 | — |
| Contemporaneous | ✅ `at` 自动写入 | — |
| **Original** | ❌ **删除即消失** | `removeEntry()` 直接 `filter` 掉，无痕迹 |
| Accurate | ✅ `inputs` 逐字留存 | — |

用户的吐槽「应该给用户空间填这个是几号实验、做什么的」——指向 **实验分组 + 备注字段**，以及**审计轨迹**。这三样现在是零。

### S1-4　导出：不支持自定义，排版已实测（「特别大」是真的）

现状 5 种：CSV / Markdown / XLSX / JSON bundle / 浏览器打印报告。

**「排版特别大」—— 已实测证实**（`.tmp/diag/export-measure.mjs`，3 条记录）：

```
列数        23（3 固定 + 10 输入 + 10 结果）
每列宽度    26,17,37,11,20,17,12,13,19,15,16,17,18,20,17,16,16,20,16,16,20,14,19
宽度合计    412 字符
1920px 屏   约可见 240 字符  →  超出 172 字符（72%）
受 42 上限截断  0 / 23        ← 不是被 max 顶爆，是列太多
```

**根因不是宽度上限，是「一字段一列」的稀疏结构。** `toXlsxDetailedRows()` 把每个 `inputs`/`outputs` 的键都拉成独立列，而**每条记录只填自己那个页签的列**——3 条记录就已经 23 列，且大部分格子是空的。20 个页签的历史会摊出几十列。

所以用户的「不知道给谁用的」是准确的：**这是一张给机器读的表，不是给人看的记录。**

具体缺口：
- **无列/字段选择** —— 列由 `detailColumns()` 从数据自动推导，用户不能选
- **无分组导出**（依赖分组功能本身）
- **无真正的 PDF 文件**，只有浏览器打印
- 文件名 `lab-calc-详细-2026-09-27.xlsx` —— **不含实验号/项目名**
- **已有说明 sheet** —— `toMetaRows()` 会写软件名/版本/导出时间/记录条数/时区/字段来源/免责声明。所以「没有注释没有说明」这条**不成立**，但说明里**没有「模型局限」**（README 那段「已校正的与未建模的」没搬进来）

### S2-1　动效是「象征性」的 —— 实测吻合

`NEXT-SESSION.md §5` 已记录：**全站 5 个 keyframes，全部是入场动画**；时长全部落在规范区间、33 处 transition 全走 token。

缺口**不是时长**（那个已合规），而是**状态过渡与空间连续性完全没有**：
- 数字结果变化：无（数字是主角）
- 面板展开/收起：瞬现，无高度过渡
- 标签切换：无内容过渡
- 图表：无描边动画

「只是象征性添加」= **有入场动画、没有交互动画**。准确。

### S2-2　11 套主题确实「换汤不换药」—— 实测吻合

实测 `THEMES` 有 11 项：`system, dark, light, catppuccin-mocha, catppuccin-latte, rose-pine, rose-pine-dawn, gruvbox, gruvbox-light, solarized-dark, solarized-light`。

4 个社区主题（Catppuccin / Rosé Pine / Gruvbox / Solarized）**只覆盖颜色 token**。所以「换汤不换药」字面正确：**11 套主题 = 同一套布局 + 同一套动效 + 同一套形状，只换颜色**。用户没有任何自定义 token 的入口。

### S2-3　顶部副标题挤占视野 —— 实测吻合

```
.brand-sub  11.5px / 高 18px / 宽 241px
文本        "实验室溶液计算 · 每次计算自动留存，随时可查"
位置        顶栏 67px 内，紧贴 h1 下方
```

这是**产品标语**，不是**导航信息**。它占掉顶栏近 1/3 高度，却对「我现在该点哪里」零帮助。吐槽准确。

### S2-4　字体不一致 —— 有实测根因

`main.jsx` 的注释说 Instrument Serif 是「Latino-only by design，是**正确**的面」，中文回退系统衬线。实测：

```
h1 字体栈  "Instrument Serif", "Songti SC", SimSun, "Noto Serif CJK SC", Georgia, serif
h1 字号    26px
```

而上一会话已归档的调研（`NEXT-SESSION.md §5`）：
- Wired 有专文报道 Instrument Serif 是「AI 加速设计趋势饱和的第一个明确牺牲品」
- 实测该字体**只渲染一个字符串**：`Lab Calc`。另两处用它的规则设的是中文，它没有中文字形，**今天就在回退系统字体**

「字体丑」的具体成因：**一个 AI 同质化标记的拉丁衬线，和它管不到的中文系统衬线，拼在同一个标题区**。视觉上不统一。

### S2-5　输入框 id 含空格与括号 —— 潜在陷阱

实测 `src/ui/components/Fields.jsx:30`：

```js
const id = idProp ?? `f-${label}`;
```

生成的 id 是 `f-目标浓度 (mol/L)`。实测当前唯一性没问题（0 个重复），`<label for>` 也能匹配。但：

- **`document.querySelector('#f-目标浓度 (mol/L)')` 会抛异常**（未引用的括号）
- 任何 CSS 选择器、自动化脚本、未来的 DOM 测试都会踩

现在不致命，是**定时炸弹**。

### S3-1　README 与 Release 的陈旧数字 / 错乱的 Latest

| 位置 | 写的 | 实际（实测） |
|---|---|---|
| `README.md` | 「1369 个测试」 | **1650** |
| v0.9.0 Release 正文 | 「1369 个测试通过」 | **1650** |
| `docs/ROADMAP.md` | 「1,281 tests」（v0.8.0 时点） | 已过期 |

**更严重的**：`gh release list` 显示

```
v0.9.0 — 科学计算器 + 手机端导航        v0.9.0
v0.8.0 — 手机端、Android…               v0.8.0
v0.7.0 — 计算之后多两张图…              v0.7.0
v0.6.0 — …                             v0.6.0
v0.4.0 — 教学用途须知、主题、视觉重构    Latest   ← 最新标记在 v0.4.0 上
```

**v0.4.0 被标成 Latest**，而 v0.5.0 不在列表里（5 个 release、编号有洞、5 个发布时间戳全在 2026-09-26 三分钟内 = 一次性回填）。访客从仓库页跳过去，**落到一个 5 个版本前的旧版**。这就是「宣传乱起八遭、最好的面没展现出来」的**最具体的一条**。

### 无法复现的一条

**「计算器的数值覆盖不进具体填入的空里面」—— 我复现不出来。**

实测 `填入字段` 流程（单位换算页签 + 称量页签各跑一遍）：

```
聚焦数值框 → 打开计算器 → 输入 2.5 → 点「填入字段」
结果：输入框 value 从 "1" 变成 "2.5"     ✅ 写入成功
```

三个候选解释，都需要你补一句当时怎么点的：

1. **计算器浮窗盖住了输入框** —— 写入成功但用户看不见，以为没进去（最可能）
2. **填入目标是「最后聚焦的字段」，但界面不告诉填哪个** —— 没有目标提示，用户以为填的是 A，实际进了 B
3. **用户想填的是下拉框/只读字段**，那些本来就不接受填入

---

## 3. 现在要做的（P0 / 1–2 轮）

判据：**不修就有用户流失或数据风险**。全部是实测确认、且有明确验收标准。

### P0-1　拆掉桌面版的白屏炸弹
**改哪里**：`src/ui/main.jsx`（SW 注册）+ `scripts/package-tauri.mjs`
**怎么做**：
- 判据从「SW API 是否存在」改成「**是否真的需要离线**」。Tauri 版资源自带，离线缓存**零收益**，直接不注册
- 或：Tauri 打包时注入 `__NO_SW__` 构建常量，`main.jsx` 见到就不注册
- **同时**修 `package-desktop.mjs` 那条基于错误事实的注释
**验收**：Tauri 打包产物启动后 `getRegistrations().length === 0`；把过期 `index.html` 埋进缓存后重启，**必须仍然正常渲染**（`sw-stale-probe.mjs` 输出不再是 `STALE-MARKER-ACTIVE`）

### P0-2　安卓 versionCode 从版本号推导
**改哪里**：`android/app/build.gradle:10`、`scripts/package-android.mjs`
**怎么做**：`versionCode` = `major*10000 + minor*100 + patch`（0.9.0 → 900）。构建脚本传 `-PappVersionCode=`
**验收**：构建后解包 APK 的 `AndroidManifest.xml`，`versionCode` 不再是 1；连出两个版本 code 递增

### P0-3　单位换算显示中文名
**改哪里**：`src/ui/components/UnitConverter.jsx:158,168`、`src/calc/units.mjs`
**怎么做**：选项文本改成 `克 (g)`；数据从 `REGISTRY` 的 `name[locale]` 取，**不新增手写表**（单一数据源）。两处下拉都改
**验收**：单位换算页签的单位下拉**每一项都含中文**；英文 locale 下显示 `gram (g)`

### P0-4　删掉顶部副标题
**改哪里**：`src/ui/App.jsx:277`、`src/ui/styles.css:426`
**怎么做**：移除 `.brand-sub` 那一行（`app.tagline` 翻译键**保留**，别删——有测试强制两边键集一致）
**验收**：顶栏高度下降；`.brand-sub` 不再在 DOM 里；品牌区只剩图标 + 标题

### P0-5　让「填入字段」告诉你填到哪
**改哪里**：`src/ui/components/CalculatorDrawer.jsx`、`src/ui/components/Fields.jsx`
**怎么做**：填入按钮旁显示目标字段的标签（`currentField()` 已有，需要能拿到它的 label）；没有目标时**按钮禁用并说明原因**，而不是可点但无事发生
**验收**：聚焦某字段 → 打开计算器，「填入字段」旁显示该字段名；未聚焦任何字段时按钮 disabled 且有提示文案

### P0-6　让陈旧数字不可能再出现
**改哪里**：`scripts/check-readme-numbers.mjs`（新增）+ `npm run verify`
**怎么做**：跑一次 `vitest --reporter=json` 拿真实测试数，跟 README / ROADMAP 里出现的 `\d{3,} 个测试` 对账，不一致就 fail
**验收**：把 README 改成 1369 → `npm run verify` 失败；改成真实值 → 通过

### P0-7　修 GitHub Release 的 Latest 指向
**怎么做**：`gh release edit v0.9.0 --latest`，并补 v0.5.0 的缺失 tag/release（或书面说明为何跳过）
**验收**：仓库首页右侧显示 v0.9.0；`gh release list` 的 Latest 在 v0.9.0

### P0-8　更新通道（Tauri updater）　✅ **已完成（2026-09-27）**

**改哪里**：`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/src/lib.rs`、
`.github/workflows/release.yml`、`src/ui/update.mjs`、`src/ui/components/UpdatePanel.jsx`

**做了什么**：
1. Ed25519 密钥对生成在 `~/.tauri/labcalc.key`，私钥进 GitHub Secrets
   （`TAURI_SIGNING_PRIVATE_KEY`），公钥写进 `plugins.updater.pubkey`
2. `endpoints` 指向 `releases/latest/download/latest.json`，`createUpdaterArtifacts: true`
3. `lib.rs` 注册 updater + process 插件；capabilities 加 `updater:default`、
   `process:allow-restart`（不是 `process:default`——前端只该能要求重启）
4. 前端：`update.mjs` 纯状态机（可无浏览器测试）+ `UpdatePanel.jsx` 懒加载插件，
   只在设置面板出现。`__TAURI_UPDATER__` 由 `TAURI_ENV_PLATFORM` 判定——
   `--mode desktop` 同时被 Electron 和 Tauri 使用，区分不了
5. 新增 Release workflow：只在 `v*` tag 触发，跑完整 verify + 断言 tag 与
   `package.json` 版本一致 + 校验 `docs/releases/vX.Y.Z.md` 存在，然后签名发布

**验收（2026-09-27 实测通过）**：构建一个 0.9.0 档的包 → 设置面板点检查 →
显示「有新版本 v0.9.1 可用」→ 点安装 → 下载、验签、安装、自动重启 →
`Get-Process` 显示运行的是 `%LOCALAPPDATA%\Lab Calc\lab-calc.exe`，版本 0.9.1。
签名密钥 id 在 `latest.json` 与编译进程序的公钥之间一致（`1b2f3dae14c3e499`）。

**顺带发现**：0.9.0 及更早的版本没有 updater，所以**第一个能自更新的版本是
0.9.1**。已经装在 0.9.0 上的用户需要手动装一次 0.9.1，之后才能自动升级。

> ⚠️ **顺序约束：P0-8 必须在 P0-1 之后。** 先修白屏再加更新通道——否则第一个通过更新通道推下去的包就可能白屏，而那时用户已经无法自救。

---

## 4. 将来要做的（P1 / 3–6 轮）

判据：**用户明确抱怨、但不至于当场弃用**。

### P1-1　补上 6 个页签的计算过程　✅ **已完成**

20 个页签里 17 个有 `worked=`，另 3 个是查表页（单位换算、元素周期表、梯度稀释——后者用 `Worked` 直接渲染）。

原文：

按用户价值排序（用户最关心「专业、不能有错」）：

| 页签 | 该有的过程 | 权威来源 |
|---|---|---|
| **Uncertainty** | GUM 不确定度预算表：每个输入量的标准不确定度 × 灵敏系数 → 合成 | JCGM 100:2008 / GUM；Kragten 数值法 |
| **Stats** | 回归完整报告：斜率/截距 ± 标准误、R²、残差、检验统计量 | 分析化学教材通用 |
| **Analytical** | 一阶/二阶导数法 + Gran 法找等当点 | LibreTexts 9.2 / Gran 1952 |
| **Physical** | 各式的量纲与推导要点 | 物理化学教材 |
| **Convert** | （已有换算系数展示）补「为什么是这个系数」 | — |
| **Elements** | 数据出处与精度说明 | IUPAC |

### P1-2　计算的深度缺口（对标 CurTiPot / 文献）

用户说「不能做好精确计算，受限很大」。实测缺的东西，按难度排：

| 功能 | 算法 | 难度 |
|---|---|---|
| **缓冲容量 β** | Van Slyke：`β = 2.303·(C·Ka·[H⁺])/(Ka+[H⁺])² + 2.303·[H⁺] + 2.303·Kw/[H⁺]` | 低 |
| **等当点：导数法** | 一阶差分找极大、二阶差分过零 | 低 |
| **等当点：Gran 法** | 等当点前 `V·[H⁺]` 对 `V` 线性回归，x 截距 = Veq | 低 |
| **完整回归报告** | 标准误、置信区间、残差分析 | 低 |
| **移液器/仪器误差** | 与不确定度模块共用预算表 | 低 |
| **Ksp / 络合平衡** | 质量平衡方程组 + Newton–Raphson / 二分 | **高** |
| **多元酸混合体系** | 同上，扩展到 >40 物种 | **高** |

**先做前五个**（低难度、高感知）。Newton–Raphson 那套（对标 ChemPy / CurTiPot）是**独立一轮**的体量，别塞进这一轮。

**该轮已完成（2026-09-27）**：`src/calc/equilibrium.mjs` 通用多平衡形态分布求解器
+ `equilibrium-presets.mjs` 四组内置体系 + 分析化学页签「溶解度与络合平衡」模式。

原计划把 Ksp/络合与多元酸混合物并列，实际做下来两者是同一件事：都只需「质量作用 +
质量守恒 + 电荷/溶度积」联立。求解器写成通用的之后，多元酸混合物只是多几个组分，
不需要第二轮。**所以这张表最后两行的「高难度」判断偏保守了**——真正的难点不在方程
数量，而在数值（见下）。

四个实测调出来的缺陷，全部是数值而非化学：

1. Jacobian 丢对角项 → 单组分系统整行全零，线性求解判奇异
2. 未知量取绝对量而非分数 → 与 pX 列差 5 个数量级，每步被非负守卫拒绝，报 stall
3. 溶度积行多带 ln10（该行求导 log 浓度，ln10 抵消）→ 该行放大 2.303 倍
4. 子集搜索把空集排最前 → 空集永远可解，模型永不沉淀

这四条合起来说明一件事：**「高难度」在这里是「难调试」而不是「难推导」**。方程谁都会写，
但四个错误里有三个的表现都是「收敛失败」而非「答案错误」，而第四个的表现是「答案错误
且收敛良好」——只有对照独立已知值才能分辨。

### P1-3　记录功能（ELN 基本要求）　✅ **已完成（2026-09-27）**

1. ✅ **实验分组** —— `src/ui/groups.mjs` + `GroupPicker.jsx`。**没按原计划
   跳存储版本**：分组存独立的 `lab-calc.groups.v1` key，记录上加 `groupId`。
   原方案要把 history 数组裹成对象，那会让所有已导出的备份失效，而迁移必须
   一次做对、且用户不会读 changelog。多一个 key 零迁移成本。
   删分组 = 解除分组不删记录（分组是标签，记录是数据）。
2. ✅ **备注/观察字段** —— 每条记录三个自由文本字段（实验号 / 用途 / 操作人）
3. ✅ **审计轨迹** —— 删除改为 `deletedAt` 标记，界面有「已删除 N 条」区可恢复
4. ✅ **自定义字段** —— 同 2

> ⚠️ **做这一项时发现并修掉了一个从第一版就在的严重缺陷**：load 与 save 分成
> 两个 effect，挂载时 save 拿到的是初始空值，**每次打开页面都把历史清空**。
> 详见 `memory/daily/2026-09-27.md`。整个「自动留存」卖点此前从未成立。

### P1-4　导出：可控 + 可读　✅ **已完成**

`xlsxPlan()` 两个视图（记录 / 数据）、列选择器、说明 sheet。

原文：

**核心改动是「一字段一列」改成「一条记录一行、字段折进单元格」** —— 这是上面 412 字符那个数的直接解药：

- **两个导出模式**（沿用已有的 `detailed` 参数）：
  - **记录视图**（默认）：固定 5 列 `时间 / 类型 / 说明 / 输入 / 结果`，输入输出折成 `字段=值; 字段=值`。宽度不再随页签数膨胀
  - **数据视图**（现 detailed）：一字段一列，给机器读。**但加列选择器** —— 默认只勾选当前筛选出的记录实际用到的列
- **列选择器** —— 导出前勾选要哪些列；记住选择
- **分组导出** —— 按实验分组导出（依赖 P1-3）
- **文件名带分组/实验号**
- **说明 sheet 补「模型局限」** —— README 那段「已校正的与未建模的」搬进来（说明 sheet 已存在，只缺这段）
- **补 CSV 的说明** —— CSV 没有说明 sheet，BOM 之后加 `#` 注释行（Excel 会把它读成一行，可接受）

### P1-5　动效重做（状态过渡 + 空间连续）

不是改时长（那个已合规），是**加交互反馈**：

| 场景 | 动什么 | 属性 |
|---|---|---|
| 结果数字变化 | 旧值 → 新值滚动 | transform（GPU） |
| 面板展开/收起 | 高度过渡 | grid-template-rows |
| 标签切换 | 内容淡入 + 微上移 | opacity + transform |
| 图表 | 折线描边 | stroke-dasharray |
| 卡片/按钮 hover | 阴影层次 | box-shadow |

**硬约束**：全部走 `prefers-reduced-motion` 降级；只动 GPU 合成属性，不触发 layout。

**参考**：Material 3 的 spring token 分**两套**——空间移动 350/500/650ms，效果反馈 150/200/300ms。这是大厂做法里最容易被忽略的一条：**位移和反馈不该同时长**。

### P1-6　自定义：从「换配色」到「换 token」　✅ **已完成（2026-09-27）**

1. ✅ **强调色 + 三档步进**（圆角 / 密度 / 动效）—— `src/ui/custom-theme.mjs` + `CustomisePanel.jsx`
   覆盖层与调色板**分开存**：换主题保留你的强调色，重置恢复调色板的值而不是硬编码默认值。
   派生 token（`--accent-hover` / `--brand-deep` / `--accent-soft`…）由所选强调色算出；
   `--accent-ink` **刻意不派生**——它是压在强调色上的文字色，派生会得到白字配黄底。
2. ✅ **导出/导入主题 JSON**
3. ⬜ token 三层化（DTCG primitive/semantic/component）—— 当前是调色板 + 覆盖层两层，够用
4. ⬜ 主题编辑器 UI 放 P2

实测 11 套主题只覆盖颜色。要真正做到「有自定义空间」：

1. **token 三层化**（DTCG 标准，2025-10 已稳定）：`primitive（blue-500）→ semantic（action-color）→ component（button-bg-primary）`
   - 现状：`--bg/--surface/--accent` 全在一个平面，**缺 primitive 与 component 两层**
2. **暴露 semantic 层给用户**：强调色、圆角、密度、动效强度
3. **可导出/导入主题 JSON** —— 用户的主题能分享
4. **主题编辑器 UI 放 P2**，不进 P1

### P1-7　品牌图标重做（用架构优势，不是换个瓶子）

用户的批评最准：「**没运用好我们的架构优势**」。

现状 `BrandMark.jsx` 是一个**工艺很好**的烧瓶（颈、身、液面、弯月面、气泡）——但它是**题材默认值**：化学应用画烧瓶，等于笔记应用画一支笔。

**这个应用真正的差异点是「每次计算自动留存」——是「记录」，不是「化学」。** 图标应该编码这个：

- 方向 A：**烧瓶 + 时间的痕迹**（液面下方分层沉积/刻度随时间累加）
- 方向 B：**计算 + 存档的合成符号**（算式折叠成层）
- 方向 C：**量器 + 刻度记忆**（刻度线一半实心=已记录，一半空心=未记录）

**这一条需要你先选方向**——见 §7。

### P1-8　有效数字与不确定度的自动传播　✅ **已完成（2026-09-27）**

**已接入 7 个页签**：称量配制、稀释（原有）+ 分光光度、滴定曲线、生物、百分比配制、浓试剂。

新增仪器源：

| 源 | 值 | 性质 |
|---|---|---|
| 光度计 | ±0.003 A | **绝对项**——读数越低占比越大，这就是 0.2–0.8 AU 工作区间的算术依据 |
| 比色皿光程 | ±0.05 mm | 相对固定；短光程皿是 2.9% 不是 0.29% |
| 滴定管 | ±0.03 mL @25 | 每次滴定读两次，容差按两次计 |
| 微量基座型（NanoDrop 一类）| 3% | **相对项**——与上面那条不同，稀释样品不会相对变差 |
| 固定光程比色皿 | 0.5% | GMP 实验室仍用它的诚实原因 |

**未接入的页签是刻意不接的**：没有仪器输入（单位换算、元素周期表），
或输入是「前提」而非测量（pH 计算里你自己定的浓度、反应计量的目标产量）。
硬塞一个预算进去 = 屏幕上出现一个用户无法核对的数。

**顺带查出的三个真 bug**（都记在 daily）：
1. 共用面板读 `budget.flask.value` 无保护 → 分光光度页签首屏崩溃
2. 吸光度模式下比色皿不参与，但面板用了乘积的相对值 → 同屏两个相对不确定度（0.327% vs 0.436%）
3. `productUncertainty` 返回**乘积**的不确定度，印在单量旁边 → 滴定页签 10 倍低估（±0.005 vs ±0.048 mL）

原文：

用户原话：「数据准确，计算方法通用，**有逻辑，最大消除误差**」。

实测对应的能力：
- ✅ 已做：Davies 活度系数、van 't Hoff 温度校正、由电中性反推离子强度
- ❌ 缺：**有效数字与不确定度自动传播**——现在结果只给一个数，不说「这个数可信到第几位」

`src/calc/uncertainty.mjs` 已存在。缺的是把它**接到每个页签的结果上**：输入有不确定度 → 结果带不确定度 → 按不确定度截断有效数字。这是「消除误差」最实在的一步。

---

## 5. 未来可以做成什么样（P2 / 愿景）

### 5.1 定位升级：从「计算器」到「实验记录的主入口」

现在讲的是「计算器 + 自动留存」。真正的护城河是**记录**——所有竞品都算完就忘（README 自己写了这句）。终局形态：

> **你在实验台边做的一切计算，自动变成一份可追溯、可导出、可归档的实验记录。**

这条线上要补：分组 → 项目 → 时间线视图 → 与论文/报告对接。

### 5.2 三端分化，各做各的最优

| 端 | 该是什么 | 现在 |
|---|---|---|
| 网页 | **零安装的演示与试用**，5 秒上手 | ✅ 已经很对 |
| Tauri 桌面 | **主力工作形态**：全键盘、多窗口、本地文件 | 🟡 缺更新通道 |
| 安卓 | **实验台边的随手记**：扫码/拍照记环境、离线优先 | 🟡 缺 versionCode，别的没做 |
| Electron | **已决定弃用** | 建议 v1.0 前移除，别维护两条 |

### 5.3 计算深度：从「能算」到「能核验」

对标 CurTiPot（这个领域的免费标杆，Excel 实现、1992 年至今）：
- 多质子体系混合平衡求解
- 滴定曲线模拟 + 实测数据非线性回归反推 pKa
- 分布图 / 平均电荷 / 等电点
- **显式缓冲容量计算**

**我们不该做的**：通用平衡求解器（PHREEQC 那类）——那是地球化学工具，对教学场景是过度设计。

### 5.4 可信度：把「值得信赖吗」做成可见的东西

README 里「**已校正的** / **未建模的**」两栏对照是这个项目**最好的资产**——诚实到罕见。应该：

1. 在**应用内**也给出——每个页签的「这个结果的边界在哪」
2. 做成一页**「我们实测了什么」**：每个数字的来源 + 校核值
3. **GitHub Release 里也写**：这一版校核了哪些值、哪些没校核

这就是「值得信赖吗」的答案，而不是加几个徽章。

### 5.5 主题生态

- 用户能保存/分享主题 JSON
- 官方维护「配色 × 密度 × 动效强度」的**组合**，而不是 11 套只有颜色不同的
- 目标：让「换汤不换药」变成「**换了汤也换了药**」

### 5.6 长期：开放的实验记录格式

`BUNDLE_FORMAT = 'lab-calc.history'` 已有版本化设计（v1）。可以做成**公开的、有 schema 的**格式——别人能写工具读写它。这是「开源项目值得信赖」最硬的证据。

---

## 6. 怎么做 —— 关键工程决策

### 6.1 顺序铁律

```
P0-1 白屏  →  P0-2 安卓 versionCode  →  P0-8 Tauri updater
                   ↑                        ↑
             必须先有可安装的新版      必须先拆掉白屏
```

### 6.2 不重构架构

上一会话的调研结论仍然成立（`NEXT-SESSION.md §5`）：FSD 那类架构是为 100+ 开发者团队设计的，公开警告「62% 的小型 React 团队过度设计导致周期延长 30%」。本项目 115 文件、单开发者、1650 测试。

**用户说不介意重构 —— 但这不解决任何一条吐槽。** 吐槽的是「算得不够深、导出不好用、界面不好看」，没有一条说「代码组织不好」。

**要做的是「易兼容稳定」，那等于：**
- 单一数据源再加一处（单位的 `name` 已在 registry 里，只需接出来 —— P0-3 就是这个模式）
- 把「陈旧数字」变成构建期可检出的（P0-6）
- 把「白屏」变成打包后可检出的（`scripts/test-desktop.mjs` 已有 CDP 驱动能力，**加一个 `--check-sw` 断言**）

**这三条都是「让错误不可能存在」，不是「换个目录结构」。**

### 6.3 每条修复都必须带一个「让它在未来不可能再犯」的检查

这是本规划的核心方法：

| 修的 bug | 配套检查 |
|---|---|
| 白屏 | 打包后脚本驱动真程序，断言 SW 未注册 + 过期缓存不影响启动 |
| README 数字陈旧 | `check-readme-numbers.mjs` 进 `verify` |
| 单位缺中文 | 测试断言单位下拉每项含中文 |
| 输入框 id 含空格 | 测试断言所有 `input[id]` 匹配 `^[A-Za-z][\w-]*$` |
| 6 个页签无过程 | 测试断言每个页签至少渲染一个「计算过程」 |
| 导出无说明 | 测试断言 XLSX 首个 sheet 含说明行 |

**理由**：这个项目已经有 1650 个测试、一个 `verify` 门禁。加检查是**顺着它已有的习惯做**，成本极低；靠人记则一定会再漂。

### 6.4 数字与判据全走实测

本次会话的方法就是模板：**不读代码猜，驱动真程序量**。
- 「白屏」——用埋过期缓存的实验证明机制可达
- 「单位没中文」——读运行中下拉框的 option 文本
- 「字体不一致」——读 `getComputedStyle` 的实际字体栈

**`.tmp/diag/` 里的 9 个脚本建议保留为 `scripts/diag/`**，它们是这个项目第一个「能驱动打包产物做断言」的工具集，`test-desktop.mjs` 已经在做同一件事。

### 6.5 一个「我不知道」，不要假装知道

**「计算器的数值覆盖不进具体填入的空里面」我复现不出来** —— 需要你补操作路径（见 §2 末尾的三个候选）。**不要把它写进待办当作已确认缺陷。** 先复现，再修。

其余全部有实测数据支撑，包括原先存疑的「导出特别大」（已量到 412 字符宽）。

---

## 7. 待你决策

你睡着的时候我不替你定这几条。醒来后回一句即可：

| # | 决策点 | 选项 | 我的建议 |
|---|---|---|---|
| 1 | **先做哪批** | A. 只做 P0（白屏+安卓+更新通道，1 轮）<br>B. P0 + 界面三件套（中文单位/删副标题/字体）<br>C. 全 P0 + P1 计算过程 | **B** —— P0 里有几条是「用户当场就看得见」的，一起发一版，用户能立刻感到变化 |
| 2 | **品牌图标方向** | A. 烧瓶+时间痕迹<br>B. 计算+存档合成符号<br>C. 量器+刻度记忆 | **A** —— 最贴「记录」这个差异点，且不与现有插画风格冲突 |
| 3 | **字体换不换** | A. 换 Geist 600（同源、零新增字节）<br>B. 留 Instrument Serif<br>C. 换一个有中文的衬线 | **A** —— 上一会话已调研完，`NEXT-SESSION §5` 有全部依据 |
| 4 | **Electron 何时移除** | A. 1.0 之前<br>B. 一直留作兜底 | **A** —— 两条打包路径 = 两倍验证成本，而 WebView2 在 Win11 是自带的 |
| 5 | **历史存储升 v2 的时机** | A. 跟记录功能一起（P1）<br>B. 现在就加迁移骨架 | **A** —— 没有 v2 的写入方之前，迁移函数没有可测的东西 |
| 6 | **「数值覆盖不进空里」当时怎么点的** | 描述一下 | — |

---

## 8. 调研来源与取舍

### 单位换算 / 开源实现
- convert-units（MIT，`to_anchor` 因子模型）— <https://github.com/convert-units/convert-units>
- unitfyi-js（220 单位 / 20 类，数量级感知舍入）— <https://github.com/fyipedia/unitfyi-js>
- 单位库清单（选型对照）— <https://github.com/OscarBennich/Comprehensive-List-Of-Unit-Checker-Libraries>
- **结论：我们自研的 `REGISTRY` 单源模型优于上述两个**（量纲指数向量可参与运算，它们只能换算）。要借的只有**展示层**，而 `name` 已经在数据里了。

### 计算化学 / 方法学
- 缓冲容量 β = dCb/dpH（Van Slyke）— <https://www.varsitytutors.com/practice/subjects/ap-chemistry/lessons/buffer-capacity>
- 酸碱滴定导数法 + Gran 法 — <https://chem.libretexts.org/Courses/Northeastern_University/CHEM_1000%3A_General_Chemistry/09%3A_Titrimetric_Methods/9.2%3A_AcidBase_Titrations>
- Gran plot — <https://en.wikipedia.org/wiki/Gran_plot>
- CurTiPot（免费标杆，含显式缓冲容量、多质子体系、非线性回归反推 pKa）— <https://www.iq.usp.br/gutz/Curtipot_.html>
- ChemPy（平衡求解 + 动力学）— <https://pypi.org/project/chempy>
- GUM / JCGM 100:2008 — <https://www.bipm.org/documents/20126/2071204/JCGM_GUM-1.pdf>
- Kragten 数值法（把偏导做成表格式差分，避免手推求导出错）— <https://www-pub.iaea.org/MTCD/publications/PDF/TCS-53_CD/_PUR/content/139.html>

### 白屏根因
- Tauri v2 白屏排查 — <https://dev.to/leo_zhang_0141218398e178/fixing-the-tauri-v2-white-screen-in-production-and-the-6-release-bugs-right-behind-it-16jk>
- Tauri + Vue 二次启动白屏 — <https://www.reddit.com/r/tauri/comments/1kgvuqf/tauri_vue_white_screen_on_second_run_works_only>
- Tauri service worker 注册失败 — <https://github.com/tauri-apps/tauri/issues/12214>
- **以上均为旁证。本项目白屏的直接证据是 `sw-stale-probe.mjs` 的实验结果，不是这些链接。**

### 更新通道
- Tauri updater 官方文档 — <https://v2.tauri.app/plugin/updater>
- Tauri v2 + GitHub 自动更新实操（含 `latest.json` 结构）— <https://thatgurjot.com/til/tauri-auto-updater>
- 版本号单一来源 — <https://github.com/orgs/tauri-apps/discussions/2776>

### ELN / 数据完整性
- ELN 基线能力（结构化元数据、审计轨迹、开放格式导出）— <https://www.technologynetworks.com/informatics/articles/electronic-lab-notebooks-for-researchers-how-elns-support-better-data-management-and-ai-analysis-414561>
- 审计轨迹 vs 版本历史（21 CFR Part 11：变更前后值 + 变更人 + 理由）— <https://casrai.org/guides/electronic-lab-notebook-template>
- 哈佛 ELN 指南（便携性：HTML/JSON/PDF/XML 为非专有格式）— <https://ari.hms.harvard.edu/electronic-laboratory-notebooks-elns-guidelines>

### 动效与设计 token
- Material 3 motion token（spatial 350/500/650ms vs effects 150/200/300ms，**两套时长**）— <https://m3.material.io/styles/motion/overview/specs>
- M3 easing/duration 分档 — <https://m3.material.io/styles/motion/easing-and-duration/tokens-specs>
- IBM Carbon motion（productive vs expressive 双曲线 + 六档时长）— <https://carbondesignsystem.com/elements/motion/overview>
- Material 1 跨设备时长（桌面 150–200ms、平板 +30%、可穿戴 −30%）— <https://m1.material.io/motion/duration-easing.html>
- token 三层架构（DTCG 2025-10 稳定）— <https://www.digitalapplied.com/blog/design-systems-2026-scale-ui-without-chaos-methodology>
- shadcn/ui 的「copy-in」中间路线 — <https://vercel.com/i/shadcn-vs-radix>

### README / 发布
- 高星项目 README 结构 — <https://dev.to/iris1031/github-readme-best-practices-how-to-write-a-readme-that-gets-stars-2gb2>
- README 评分表（10 项自查）— <https://rivereditor.com/blogs/write-perfect-readme-github-repo>
- GitHub 官方讨论「什么样的 README 算优秀」— <https://github.com/orgs/community/discussions/176605>

### 8.1 我对这些来源的取舍

**采纳**：M3 双时长体系（有规范、可测）、GUM/Kragten（有标准号）、Gran/导数法（有教材）、ELN 审计轨迹（有法规来源）、token 三层（有 DTCG 标准）。

**不采纳**：
- README 那些「加 Star History 提升 15% 转化」的说法 —— 来源是营销号，无实测，**不写进计划**
- FSD 架构 —— 上个会话已否决，理由仍成立（62% 过度设计）
- 通用平衡求解器（PHREEQC 类）—— 对教学场景是过度设计

---

## 9. 下一步

**P0 与 P1 全部完成，v0.9.2 已发布。**

用户已授权全权处理，因此 §7 的决策项按建议执行，不再等待：

| # | 决策 | 已定 |
|---|---|---|
| 1 | 先做哪批 | 全做（P0 + P1 都已完成）|
| 2 | 品牌图标方向 | A（烧瓶 + 时间痕迹）——已落地为「分层 = 一次计算」，内联与光栅两处一致 |
| 3 | 字体 | A（Geist 600）——已换，零新增字节 |
| 4 | Electron 何时移除 | **已定：不移除**，保留为 WebView2 缺失时的退路（见下）|
| 5 | 历史存储升 v2 | 已随记录功能落地（分组 + 审计轨迹 + 自定义字段）|

**剩余可做（P2 愿景，非欠账）**：

- ~~Electron 打包路径清理（决策 4）~~ **决定保留，理由如下**

  原计划「桌面已走 Tauri，Electron 路径可清」。重新评估后不清理：**它是 WebView2
  缺失或损坏时唯一的退路**，而那个场景真实存在（精简版 Windows、企业镜像、
  WebView2 运行时被安全软件拦掉）。删掉它，这些用户就没有任何可用的桌面版本。

  代价也实测过：`scripts/package-desktop.mjs` 是手写脚本、零依赖（注释里记了为什么
  不用 electron-builder——271 个包，且 npm v12 默认拦 install script），产物 125 MB
  挂在 release 上。**不清理的成本是每次发布多传一个文件，清理的成本是一部分用户
  装不上。** README 已经写明默认用 Tauri、Electron 是退路，两者是同一应用的两条
  打包路径而非两个功能集。

  判断依据：**「代码路径没人用」和「代码路径是兜底」是两件事**，前者该删，后者该留。
  这一条原来被归成前者，是因为只看了使用频率没看它兜的是什么。
- 主题编辑器 UI（P1-6 第 4 项，当时刻意推迟）
- token 三层化（DTCG primitive/semantic/component）
- P1-8 剩余 13 个页签：**刻意不接**，理由见 §4
- ~~P1-2 的高难度项：Ksp / 络合平衡、多元酸混合物~~ **已完成**，见 §4 P1-2 末

— via Claude Code, 2026-09-27（最后更新：v0.9.2 发布后）
