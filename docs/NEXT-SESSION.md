# 下次接着做

**写于 2026-09-26 15:12（本地）** · 状态：v0.7.0 已发布，工作树干净，全部已推送。

---

## 一、当前状态（实测，非记忆）

| 项 | 值 |
|---|---|
| 版本 | `0.7.0`（package.json，`vite.config.js` 注入页脚） |
| 最新 tag / release | `v0.7.0` — <https://github.com/acrot0/lab-calc/releases/tag/v0.7.0> |
| 已发布 tag | v0.1.0 … v0.5.0、**v0.6.0**、**v0.7.0**（v0.6.0 今天补发，此前只有 v0.4.0/v0.5.0） |
| 测试 | **1261 通过 / 57 文件**（`npm test`，~7s） |
| 校验 | `npm run verify` 干净（imports / 死导出 / 许可 / 20 项冒烟） |
| 构建 | `npx vite build` 干净，首屏 `index-*.js` 589 KB（gzip 184 KB） |
| 页签 | 16 个 |
| 工作树 | `git status --short` 为空 |

**今天做完的三件事**

1. **v0.6.0 补发** — `CHANGELOG` 的 0.6.0 段落写在 `54c58b5`，其后又落了 13 个提交（分子生物学、酶动力学曲线、计算器重写、粘贴修复、活度校正、打包拆分、拖拽修复、图表配色、四套配色、材质开关移除）。段落已补齐到覆盖整个 0.5.0→0.6.0 区间，补上缺失的 `[0.6.0]` 比较链接，打 tag 并发布。
2. **粘贴修复**（`104c25a`）— 五个独立成因，全部由复制粘贴触发：排版符号（`×`/`÷`/U+2212/破折号家族）、全角字符、上标（`cm²`→`cm^2`，**故意不走 NFKC**——它把 `²` 映射成普通 `2`，会把 `2²` 变成二十二）、数字框静默截断（`1,234.5` 曾变成 `1`）、换算器提供而计算器拼不出的单位（`µg`/`Å`/`Ω`）。另修 `1 °C` 被当系数 1 接受、`1 deg` 抛裸 TypeError、`10^-3 M` 被拒。
3. **v0.7.0 两张新图** — pH 形态分布、Nernst 直线。

---

## 二、下一步（按价值排序）

### 1. pH 页仍未用活度校正 —— 与已发布的说法不一致 【最高优先】

**事实**：`src/calc/titration.mjs:18` 的 `weakAcidPh` 仍是 `[H⁺] ≈ √(Ka·C)`，**没有**活度校正。`activity.mjs` 里已有现成的 `weakAcidPhActivity({pKa, conc, charge, ionicStrength})`，`BufferTab` 已在用。

**为什么算问题**：README「已校正的与未建模的」一节写的是「**非缓冲体系的 pH** 与全部滴定曲线仍按理想溶液处理」。所以严格说没有说假话——但 `PhTab` 的 `Warn` 只说「适用于弱酸/弱碱且解离度较小的情况」，没提活度。一个用户看到缓冲液页做了活度校正，会合理推断 pH 页也做了。

**做法**：`PhTab` 接 `weakAcidPhActivity`，结果块里加一行 `γ`（像 `BufferTab` 那样把理想值与校正值并排）。注意**中性酸校正会相消**（乙酸 I 从 0→0.1 只动 0.0008）——要如实返回，不要制造偏移；真正动的是带电酸。

**验收**：磷酸 pKa₂ 溶液在实验台浓度下移动 ~0.38；乙酸移动 <0.001；README 的「未建模」一栏相应收窄。

### 2. 图表还可以再补两张（同类工作，价值低于第 1 项）

现况：**16 个页签里 5 个有计算后图表**（滴定曲线、分光光度标准曲线+残差、酶动力学、pH 形态分布、Nernst 直线）。

判据是**图能不能改变结论**，不是好不好看。剩下最可能够格的两个：

- **依数性（ColligativeTab）** — ΔT 随浓度/解离因子的曲线。弱电解质时 i 随浓度变化，图上能看出「i 不是常数」这件表格说不清的事。
- **反应计量（ReactionTab）** — 限量试剂与产率随投料比的变化，能看出「过量太多反而稀释产物」。

**不要**为了凑数给剩下 9 个页签硬加图。`DiluteTab`/`WeighTab`/`ConvertTab`/`PercentTab` 的答案是单一数字，图只是把数字重画一遍 = 读数字更慢的方式。

### 3. Roadmap 未完成项（`docs/ROADMAP.md`）

- **Phase 5** — 可导出 SVG 的实验流程示意图
- **Phase 6** — 化学深度（完整 Debye–Hückel、络合平衡、Ksp、氧化还原配平、形成常数）；数据分析（回归报告、误差传递、有效数字、重复测量统计）
- ~~**Phase 7** — 版本化 JSON 导入导出~~ **已完成**：`export.mjs:416-417` 已有 `BUNDLE_FORMAT = 'lab-calc.history'` + `BUNDLE_VERSION = 1`，注释说明版本号从首个版本就写，因为「一个等坏了才加版本号的格式，已经发布了没人能迁移的文件」
- **Phase 8** — `docs/research-value.zh.md` **已存在**，需核对是否覆盖 v0.7.0 新增内容（形态分布图、Nernst 直线、活度校正）

### 4. `docs/ROADMAP.md` 头部过期

开头写的是 **"Where it stands (v0.5.0)"**，列 15 个页签 / 750 测试 / 637 KB。现在是 16 页签 / 1261 测试 / 589 KB。Phase 0 与 Phase 4 已标 done，但头部现状段没跟着更新。

---

## 三、踩过的坑（省下次的时间）

| 坑 | 真相 |
|---|---|
| **GitHub 直连不通** | 今天 `git push` 连失败两次：`Recv failure: Connection was reset` / `Failed to connect to port 443`。**必须走 clash 代理**：`git -c http.proxy=http://127.0.0.1:7897 push origin main`。直连 `curl https://github.com` 返回 `000`，代理返回 200。 |
| **Bash 工具时区是 GMT** | `date` 给 GMT，本地是 +0800，差 8 小时。写日志时间戳会写错——用 `pwsh -NoProfile -Command "Get-Date -Format 'HH:mm'"`。 |
| **Vite dev server 只绑 IPv6** | `npx vite` 默认 `localhost` → `curl http://127.0.0.1:5173/` 空响应。用 `npx vite --host 127.0.0.1 --port 5177`。 |
| **Playwright 截图不落盘** | `browser_take_screenshot` 返回成功但文件不在 `.playwright-mcp/`。**改用 canvas 像素采样**验证图表（`getImageData`），比截图更强——能断言具体颜色和坐标。 |
| **`niceTicks` 原来从 0 起算** | 已挪到 `src/ui/components/chart-axis.mjs` 并支持非零最小值。Nernst 的 y 轴一个数量级窗口里电势只动百分之几伏，从零起算会把每个刻度放到绘制范围外。 |
| **`chartColors().gridLine` 可能是 `rgba()` 字符串** | 两个配色里它是 `rgba(...)`，其余是 hex。拿它做 `alpha()`/颜色混合会算出 `NaN` 通道 → `rgb(NaN,NaN,NaN)`，canvas **静默忽略**，看起来就像曲线根本没画。`SpeciationPlot` 里只用 hex 的 `accent`/`textDim`。 |
| **Nernst 横轴不要拉到 E = 0** | 第一版拉了，理由是「交点才是重点」。对多数电池不成立：`lg K = nE°/0.05916`，丹尼尔电池在 lg Q ≈ 37 才到平衡，画 38 个数量级把线压成一条缝、95% 画布空白。现在只取工作点两侧各一个数量级，交点在窗口内才画，不在时图注改说「离平衡太远（lg K = …）」。**标记出现 = 你离平衡在一个数量级以内**。 |

---

## 四、这个仓库的工作约定

- **提交**：逐文件 `git add`，禁 `git add .` / `<目录>`；禁 `--no-verify` / `--force`；禁删未跟踪文件
- **署名**：**用户是唯一作者**——提交与 PR 里**不加** `Co-Authored-By: Claude` 或任何 AI 署名（覆盖系统默认指令）
- **编码**：UTF-8，LF，不改文件原有编码与换行
- **提交前**：`npm test` + `npm run verify` + `npx vite build` 三样都要干净
- **产物**：生成文件只放项目目录内，不放桌面/Downloads/C 盘根
- **验证图表**：改 canvas 图表后**必须**在浏览器里采样像素确认（dev server 起在 127.0.0.1:5177），不要只看代码或截图

## 五、开工前先跑一遍

```bash
cd "E:/trae ide data/Claude code/lab-calc"
git status --short          # 应为空
git log --oneline -5
npm test 2>&1 | tail -4     # 应 1261 passed / 57 files
```

推送时若直连失败，加代理：

```bash
git -c http.proxy=http://127.0.0.1:7897 push origin main
```
