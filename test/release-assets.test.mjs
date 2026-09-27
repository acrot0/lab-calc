import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * The release workflow checks the release against the README's install table.
 *
 * The defect this guards is not in the scanner — it is that nothing ran the
 * scanner. A check written and not wired is a check that reports nothing, and
 * it is indistinguishable from a passing one.
 *
 * The assets themselves cannot be verified here: there is no release during a
 * local test run, and reaching GitHub from a build machine is not a check.
 * What is testable is the wiring and the promise table.
 */

const WORKFLOW = readFileSync('.github/workflows/release.yml', 'utf8');
const SCRIPT = readFileSync('scripts/check-release-assets.mjs', 'utf8');
const README = readFileSync('README.md', 'utf8');

describe('the release asset check is wired up', () => {
  it('should run as a step of the release workflow', () => {
    expect(WORKFLOW, 'the release workflow never runs the asset check')
      .toContain('check-release-assets.mjs');
  });

  it('should run against the tag being released, not the latest', () => {
    // Releasing v0.10.0 while v0.10.1 is "latest" would otherwise check the
    // wrong release and pass.
    expect(WORKFLOW).toMatch(/check-release-assets\.mjs "\$\{GITHUB_REF_NAME\}"/);
  });

  it('should give the step a token, or gh has no credentials on the runner', () => {
    const step = WORKFLOW.slice(WORKFLOW.indexOf('check-release-assets.mjs') - 700);
    expect(step, 'the check step has no GITHUB_TOKEN').toContain('GITHUB_TOKEN');
  });

  it('should run before the release is published', () => {
    // A draft is still a release to the API, so checking the draft is what
    // makes the failure cheap: the draft is edited, not deleted.
    //
    // `tauri-action` creates it as a draft and the notes step edits it; the
    // check must come after both, since the upload is what it inspects.
    const uploadAt = WORKFLOW.indexOf('includeUpdaterJson: true');
    const checkAt = WORKFLOW.indexOf('check-release-assets.mjs');
    expect(uploadAt, 'the upload step moved — this ordering test needs rewriting').toBeGreaterThan(-1);
    expect(checkAt, 'the check runs before the assets are uploaded').toBeGreaterThan(uploadAt);
  });
});

describe('the promise table', () => {
  it('should name every artifact the README offers', () => {
    // Three downloadable artifacts; the web/PWA row is a URL, not a file, so it
    // is correctly absent. If a row is added to the README and not here, the
    // check silently stops covering it.
    for (const row of ['Android APK', 'Windows 安装包（Tauri）', 'Windows 免安装（Electron）']) {
      expect(README, `README no longer offers ${row}`).toContain(row);
      expect(SCRIPT, `${row} is not in the promise table`).toContain(row);
    }
  });

  it('should not promise an artifact no script produces', () => {
    // The rows are named after files the packaging scripts write. A row whose
    // matcher recognises nothing would fail every release, which is a noisy
    // kind of wrong — better to catch it here.
    expect(SCRIPT).toMatch(/-setup\\\.exe\$\/\.test/);
    expect(SCRIPT).toMatch(/win-x64\\\.zip\$\/\.test/);
    expect(SCRIPT).toMatch(/\.apk\$\/\.test/);
  });

  it('should exit 0 rather than fail when there is no release to check', () => {
    // A local run, or a tag the API cannot see. Failing there would make this
    // guard annoying enough to delete.
    expect(SCRIPT).toMatch(/查不到 release[\s\S]{0,120}process\.exit\(0\)/);
  });
});
