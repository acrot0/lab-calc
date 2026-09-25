# 返工计划（2026-09-25）

来自用户反馈的六条问题，以及每条的处置方式与依据。

## 反馈逐条对照

| # | 用户原话 | 根因 | 处置 |
|---|---------|------|------|
| 1 | 网页图标不太好看 | 扁平双色烧瓶，无质感；且图标底色 `#0f1115` 与应用背景 `#0b0d12` 不一致 | 重绘图标；修色值不一致 |
| 2 | 界面普通；浅色要更高级；深色"什么玩意"；动效不好；颜色搭配不对 | 深色是单层径向渐变；全站仅 5 个 keyframes；无主题切换 | 多主题（社区标准配色）+ 动效系统 |
| 3 | 导出导入不好，格式少，不够详细直观 | 只有 CSV/MD/JSON；无表格、无报告 | 加 xlsx + PDF 报告 |
| 5 | 各种搭配普通，没上网查素材库 | 图标库 lucide 单字重；素材未调研 | 换 Phosphor（6 字重）；素材自行绘制 |
| 6 | 桌面版手机版没上线，GitHub 要开源 | Pages 已配好但 3 个提交未推 | 推送上线 |

（第 4 条用户未写，按 5 条计。）

## 一、多主题（核心）

**不再自创配色，改用有出处的社区标准主题**，每个都核实过授权：

| 主题 | 上游 | 授权 | 气质 |
|------|------|------|------|
| Catppuccin Latte | catppuccin.com | MIT ✅ | 浅色，柔和粉彩 |
| Catppuccin Mocha | catppuccin.com | MIT ✅ | 深色，柔和粉彩 |
| Nord | nordtheme.com | MIT ✅ | 北极蓝，冷调极简 |
| Rosé Pine | rosepinetheme.com | MIT ✅ | 玫瑰灰粉，优雅 |
| Tokyo Night | tokyo-night-vscode-theme | MIT ✅ | 东京夜景霓虹 |

保留现有深色/浅色作为默认（避免用户既有习惯被打断），新增以上 5 套。
`theme.mjs` 的 `THEMES` 从 3 项扩到 8 项，切换 UI 改为下拉（现在循环按钮放不下 8 个）。

**可行性**：全站颜色已高度 token 化——CSS 里只有 8 处硬编码色值，JS 里 8 处。
所以每套主题只是覆盖 `--bg/--surface/--text/--accent` 等 token，不需改组件。

**必须做的验证**：每套主题跑对比度测试（正文 ≥4.5:1）。社区主题按编辑器设计，
不一定满足 Web 正文标准——实测不达标的要调，不能直接搬。

## 二、动效

现状：5 个 keyframes，全部是入场动画（rise/fade/rise-in/tab-underline/cell-in）。
缺的是**状态过渡**与**空间连续性**：

- 数字结果变化：从旧值滚动到新值（数字是主角，值得动）
- 面板展开/收起：高度过渡，而非瞬现
- Tab 切换：内容淡入 + 轻微上移
- 图表：折线描边动画（stroke-dasharray）
- 按钮/卡片 hover：已有 transform，补阴影层次过渡
- **全部走 `prefers-reduced-motion` 降级**（无障碍硬要求）

原则：GPU 合成属性（transform/opacity）优先，不触发 layout。

## 三、图标

**根因**：lucide 是 Feather 分支，单字重 2px。Phosphor 提供 6 种字重
（thin/light/regular/bold/fill/duotone），`duotone` 是精致度来源。

方案：
- 界面图标 → Phosphor（MIT），关键处用 duotone
- **应用图标（PWA）重绘**：立体渐变烧瓶，加高光/液面反光/柔和投影；
  底色改为与应用一致的 `#0b0d12`
- 素材：**不用免费素材库**——实测 publicdomainvectors 等是 clip art 级，
  达不到高级感。项目已有手绘 SVG 传统（Illustrations.jsx），继续自绘

## 四、导出

现状：CSV / Markdown / JSON（`export.mjs`）。

新增：
- **xlsx**：需引入 `exceljs` 或 `xlsx`(SheetJS)。体积约 300-900KB。
  取舍：动态 import，只在点导出时加载，不进首屏包
- **PDF 报告**：用户已选"浏览器打印→PDF"。
  做 `@media print` 专业排版样式，零依赖，矢量文字可选可搜

**风险**：xlsx 库体积大且 SheetJS 社区版授权需再核实（Apache-2.0 vs 商业）。
若授权不合，改用 `exceljs`（MIT）。

## 五、上线

已核实：
- 仓库 **已是 PUBLIC**
- Pages **已配置**（`build_type: workflow`，源 main）
- `deploy.yml` 已存在且含测试门禁
- `base: './'` 已兼容子目录
- **3 个本地提交未推**

动作：推送到 main → Pages 自动部署 → 验证 `https://acrot0.github.io/lab-calc/`

**遗留问题**：`origin/feat/deploy-export-curve` 是过时分支（比 main 少 19247 行，
另一条血统）。需与用户确认是否删除。

## 六、桌面/手机

- 桌面：`scripts/package-desktop.mjs` 已有（便携版，非安装程序）
- 手机：PWA 已可安装（manifest + service worker 齐备）
- 缺：上线后实际验证安装流程；桌面版需重新打包并验证

## 文档修正

`docs/ROADMAP.md` 声称有 `scripts/check-licences.mjs` 强制授权检查——
**该文件不存在**。这是假声明，必须删除或补实现。
本次要引入第三方主题与图标库，授权检查正好该补上。

## 执行顺序

1. 主题系统（token 重构 + 5 套主题 + 对比度测试）
2. 动效系统
3. 图标（Phosphor + 应用图标重绘）
4. 导出（xlsx + 打印样式）
5. 上线推送 + 验证
6. 桌面打包 + 手机安装验证
7. 文档修正 + 授权检查脚本

用户要求"全部做完再交"。
