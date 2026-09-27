/**
 * The version, as Android counts it.
 *
 * Android decides whether an APK is an upgrade by comparing integers, not
 * version names: a build whose `versionCode` is not greater than the installed
 * one is refused. `versionName` was read from `package.json` but `versionCode`
 * was left at the template's `1`, so every release after the first would have
 * been rejected — and the symptom is not an error message, it is a user saying
 * the update did not install.
 *
 * The encoding is the one the Android documentation recommends, two digits per
 * component:
 *
 *     0.9.0   →   900
 *     0.10.0  →  1000
 *     1.0.0   → 10000
 *
 * Two digits is a real ceiling, not a formality: at 100 minor versions
 * `0.100.0` and `1.0.0` both encode to 10000, and two releases sharing a code
 * means the second installs as a no-op. Refusing is the honest outcome — the
 * build stops, rather than shipping an APK that cannot be told apart from one
 * the user already has.
 */
export function androidVersionCode(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? ''));
  if (!m) {
    throw new Error(`不是合法的 x.y.z 版本号，无法推导 versionCode：${JSON.stringify(version)}`);
  }
  const [major, minor, patch] = m.slice(1).map(Number);
  if (minor > 99 || patch > 99) {
    throw new Error(
      `versionCode 每段最多两位（当前 ${major}.${minor}.${patch}）：`
      + 'minor 或 patch 超过 99 会与更高一位的版本号撞码，两个版本将无法区分。',
    );
  }
  return major * 10000 + minor * 100 + patch;
}
