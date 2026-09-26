# 手机端设计依据

写下来是为了让「为什么这样排」有据可查，而不是凭手感。数值来自平台规范，
不是估算。

## 平台规范（2026-09-26 查证）

| 项 | Material 3 导航栏 | iOS 标签栏 |
|---|---|---|
| 容器高度 | 80dp（medium）、64dp（small） | 49pt + 底部 34pt 安全区 |
| 图标 | 24dp | 25pt（约 30×30 px @1x） |
| 标签字号 | `labelMedium` = 12sp / 500 weight | Caption 12pt |
| 选中指示 | pill 形，`secondaryContainer` 色 | 着色图标 + 标签 |
| 容器色 | `surfaceContainerHigh` | 系统材质 |
| **目标项数** | **3–5 个** | **3–5 个** |

来源：
- Flutter 的 M3E 实现（镜像 M3 token）— <https://pub.dev/packages/navigation_bar_m3e>
- 平台规范汇总 — <https://github.com/github/awesome-copilot/blob/main/skills/penpot-uiux-design/references/platform-guidelines.md>

**关键结论**：两家规范都写「3–5 个顶级目标」，且都明确「5 个以上用抽屉/更多面板」。
本应用 16 个页签，所以底部导航放 5 个 + 「更多」面板不是妥协，是按规范做。

## 为什么不是别的做法

**顶部横排标签（原做法）**：实测在 390px 下，顶栏已被品牌行与控制行占满，
标签被挤到第三行；且顶部不在拇指热区。两家规范都把主导航放底部，原因就是这个。

**底部导航放全部 16 项**：违反 3–5 的规范值，且 16 项在 390px 下每项仅 24px 宽，
低于 44px 触控底线。

## 触控尺寸

44×44 CSS px 是底线（Apple HIG）与 48×48 dp（Material）的较小值，本应用取 44。
已在计算器上实测并修正：按键从 40px 提到 44px，DEG/RAD 从 48×28 提到 56×44，
单位 chip 从 28px 提到 44px。

## 拇指热区

屏幕底部约 1/3 是单手拇指最易触达的区域，顶部两角最难。这决定了两件事：

1. 主导航放底部。
2. 计算器的主操作键（数字、`=`）放在键盘区的**下半部**，科学函数在上半部。

## 待验证

以上数值来自平台规范与镜像实现，**未在真机实测**。真机验证项：
- 底部导航在 iOS Safari 的 `env(safe-area-inset-bottom)` 下是否被 home indicator 遮挡
- 键盘弹起时底部导航是否被顶起（`visualViewport` 在底部导航场景下的行为）
