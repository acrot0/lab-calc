# 发布流程

三端产物、签名密钥的保管，以及一份发布前必须逐条勾掉的清单。

---

## 1. 签名密钥

### 它在哪

| 文件 | 位置 | 是否入库 |
|---|---|---|
| keystore | `android/lab-calc-release.jks` | **否**（`android/.gitignore`） |
| 口令与别名 | `android/keystore.properties` | **否**（同上） |

### 为什么不能入库

这是 `com.labcalc.app` 这个包名的身份，不是一份配置。

拿到密钥的人可以发布一份更新，**所有已安装副本都会当作正版接受**——Android 只比对签名，不比对来源。而且没有吊销机制：密钥泄露无法作废，只能换包名重新开始，已有的用户不会跟过来。

所以这两个文件必须：

1. **备份到本机之外。** 至少两处，其中一处离线。丢了密钥就再也无法给已发布的包发更新，用户只能卸载重装。
2. **不进任何仓库。** 包括私有仓库——私有仓库会改可见性，密钥不会因为当时是私有的就变得安全。
3. **不进 CI 的明文变量。** GitHub Actions 用 Secrets，且只在发布 job 里注入。

### 指纹

```
SHA-256  62:10:CE:17:86:74:A0:85:1D:77:5D:EB:42:88:1A:37:BE:20:78:B9:37:60:C2:5E:BF:9B:5E:F5:92:7C:CD:08
SHA-1    B8:2E:6B:A6:7F:FB:8D:34:31:37:FE:50:C3:AD:26:F3:69:C0:DB:D1
```

核对：

```bash
keytool -list -v -keystore android/lab-calc-release.jks -storepass <口令>
```

证书 `CN=acrot0`，RSA 4096，有效期至 2056-09-20。

### 重新生成

只有在密钥丢失或泄露时才做，且要接受**已有的安装无法更新**。

```bash
keytool -genkeypair -v \
  -keystore android/lab-calc-release.jks \
  -alias labcalc -keyalg RSA -keysize 4096 -validity 10950 \
  -storepass '<新口令>' -keypass '<新口令>' \
  -dname "CN=acrot0, OU=lab-calc, O=lab-calc, C=CN"
```

生成后把新指纹写进 `keystore.properties` 的注释和 README，两处都要改。

---

## 2. 三端构建

### Android

```bash
npm run package:android -- --release
```

- `--release` 缺省不带，默认出调试包（能装能测，但不能覆盖正式包，商店也不收）。
- 脚本会在构建**之前**检查 `keystore.properties` 是否存在——签名缺了要到 Gradle 跑完五分钟才失败，检查提前到一句话。
- 构建后用 `apksigner verify` 校验签名，并把指纹与 `keystore.properties` 里记录的值比对。
- `versionCode` 由 `package.json` 的版本推导（`1.0.0` → `10000`，见 `src/ui/version.mjs`）。**不要手改**：Android 靠这个整数判断是不是升级，写小了会被静默拒绝，用户侧只看到「更新没生效」。

### 桌面（Tauri，默认）

```bash
npm run package:tauri
```

产物在 `src-tauri/target/release/bundle/`。更新通道指向
`https://github.com/acrot0/lab-calc/releases/latest/download/latest.json`，
签名私钥在 `~/.tauri/labcalc.key`（**同样要在别处备份**，丢了就无法给桌面端推更新）。

### 桌面（Electron，WebView2 缺失时的兜底）

```bash
npm run package:desktop
```

---

## 3. 发布前清单

逐条勾，不跳。

### 代码

- [ ] `npm test` 全绿（**先跑这个**；`npm run verify` 不检查测试失败，见第 4 节）
- [ ] `npm run verify` 全绿（含作者署名检查：只允许 `acrot0`，无任何 AI 署名）
- [ ] `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 三处版本一致
- [ ] 两个 lock 文件（`package-lock.json`、`src-tauri/Cargo.lock`）也是新版本（见第 4 节）
- [ ] `node -e "import('./src/ui/version.mjs').then(m=>console.log(m.androidVersionCode('X.Y.Z')))"` 能算出整数且大于上一版

### 人工核对

- [ ] 20 个标签页逐个打开：无报错、无空值、无遮挡
- [ ] 每个页签点一次「示例」按钮，确认算得出结果
- [ ] 清空记录后确认撤销条出现且可用
- [ ] 导出一次 CSV / Markdown / xlsx，确认 Markdown 有出处表头与配方卡
- [ ] 存一张分享图片，确认数字与单位正确
- [ ] `prefers-reduced-motion: reduce` 下确认动画全部关闭

### 产物

- [ ] APK 是 release 签名，`apksigner verify --print-certs` 指纹与本文档一致
- [ ] 桌面端安装包能打开，版本号显示 1.0.0
- [ ] 更新通道 `latest.json` 指向本次发布

### 发布

- [ ] `git tag v1.0.0 && git push origin v1.0.0`
- [ ] GitHub Release 附上三端产物
- [ ] Release 说明写清**签名指纹**，让用户能自己核对

---

## 4. 版本号怎么改

**六处**，分两类。

### 必须改的三处（改漏了会出真问题）

| 文件 | 字段 | 漏了会怎样 |
|---|---|---|
| `package.json` | `version` | 发布 tag 与文档里的版本号错位 |
| `src-tauri/tauri.conf.json` | `version` | 桌面端关于页显示旧版本 |
| `src-tauri/Cargo.toml` | `version` | **更新通道失效**：安装包按 Cargo.toml 构建，更新检查拿二进制自己的版本比对，用户在新版上仍被提示「已是最新」 |

`Cargo.toml` 这一行是本表原先漏掉的第三处（2026-09-28 v1.1.0 发版时被
CI 的 `test/update-channel.test.mjs` 拦下）。漏掉它不会有任何本地症状：
构建成功、安装包产出、发布照常，只有更新检查静默失效。

### 跟着改的三处（不改不影响功能，但不改这句话就不成立）

| 文件 | 何时会改 |
|---|---|
| `package-lock.json` | 跑 `npm install --package-lock-only` 自动同步 |
| `src-tauri/Cargo.lock` | 下一次 cargo 构建时自动同步 |
| Android | **永远不改**——从 `package.json` 推导 |

两个 lock 文件不影响构建产物，所以漏掉它们不会有任何症状。它们漂移的
代价是**核查失效**：一个想确认「版本都改了吗」的人会看到 lock 里写着
两个版本之前的数字，然后要么花时间查它是否有意义，要么学会忽略版本检查。
v1.2.0 发版时两个都停在 1.0.0，落后两版。

### 顺序

改完**必须跑 `npm test`**——`npm run verify` 不够。`check-doc-numbers`
会用 `--reporter=json` 跑一遍套件，但它只读取报告里的测试**计数**，
不检查是否有失败（那是 `npm test` 的职责），所以套件有失败时 verify
仍可能报绿。v1.1.0 发版时就踩了这个：verify 全绿，CI 红了。
正确的顺序是 `npm test` → `npm run verify`。
