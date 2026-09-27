import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { androidVersionCode } from '../src/ui/version.mjs';

/*
 * `versionCode` was hard-coded to 1 in `android/app/build.gradle`.
 *
 * Android uses it to decide whether an APK is an upgrade: a build with a code
 * lower than or equal to the installed one is **refused**, silently, from the
 * user's side. So every release after the first would have failed to install
 * over the previous one, and the symptom is not an error — it is a user who
 * says the update did not work. `versionName` was already read from
 * package.json; only the integer that Android actually enforces was left
 * behind, which is exactly the kind of field nobody notices.
 *
 * The mapping is monotonic in each version component, so a later release always
 * outranks an earlier one:
 *
 *     0.9.0   →   900
 *     0.9.1   →   901
 *     0.10.0  →  1000    (major*10000 + minor*100)
 *     1.0.0   → 10000
 *
 * Two digits per component caps minor and patch at 99. Past that the fields
 * collide — 0.100.0 and 1.0.0 would both be 10000 — so the function refuses
 * rather than emitting a code that silently orders two releases the same.
 */

const gradle = readFileSync('android/app/build.gradle', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

describe('androidVersionCode', () => {
  it('should map the documented examples', () => {
    expect(androidVersionCode('0.9.0')).toBe(900);
    expect(androidVersionCode('0.9.1')).toBe(901);
    expect(androidVersionCode('0.10.0')).toBe(1000);
    expect(androidVersionCode('1.0.0')).toBe(10000);
  });

  it('should increase strictly across a release sequence', () => {
    const seq = ['0.9.0', '0.9.1', '0.9.2', '0.10.0', '0.11.0', '1.0.0', '1.2.3'];
    const codes = seq.map(androidVersionCode);
    for (let i = 1; i < codes.length; i += 1) {
      expect(codes[i], `${seq[i]} must outrank ${seq[i - 1]}`).toBeGreaterThan(codes[i - 1]);
    }
  });

  it('should refuse a component it cannot encode rather than collide', () => {
    // The alternative is two different releases with the same code, and the
    // second one installs over the first as a no-op.
    expect(() => androidVersionCode('0.100.0')).toThrow();
    expect(() => androidVersionCode('0.9.100')).toThrow();
  });

  it('should refuse something that is not a version', () => {
    for (const bad of ['', 'abc', '1.2', '1.2.3.4', 'v1.2.3', null, undefined]) {
      expect(() => androidVersionCode(bad), `${bad} must be refused`).toThrow();
    }
  });

  it('should accept the repository version', () => {
    // Whatever package.json says today has to be encodable, or the next
    // release fails at build time rather than at install time.
    expect(androidVersionCode(pkg.version)).toBeGreaterThan(0);
  });
});

describe('the gradle build reads it', () => {
  it('should not hard-code versionCode', () => {
    expect(gradle).not.toMatch(/versionCode\s+1\b/);
  });

  it('should take versionCode from the build property', () => {
    // Same shape as the versionName line above it, so there is one mechanism
    // rather than two, and the build fails loudly if the script forgets to pass
    // it instead of quietly shipping code 1 again.
    expect(gradle).toMatch(/versionCode\s+project\.hasProperty\('appVersionCode'\)/);
  });
});
