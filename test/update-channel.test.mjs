import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/*
 * The desktop update channel.
 *
 * A Tauri updater is a remote-code-execution path by design: it downloads a
 * binary and runs it. What makes it safe is that the download is signed and the
 * public key is compiled into the app — so the only things that must be right
 * are the ones checked here: the key is present and is a real minisign key, the
 * endpoint is the one GitHub redirects to, the signing is enabled so the
 * artifacts and `.sig` files are produced at all, and the version the updater
 * reports is the version that was built.
 *
 * These are config assertions, which is unusual for this suite — but the failure
 * mode is silent. A missing `createUpdaterArtifacts` produces a build that looks
 * completely normal and ships no update; a version that disagrees between
 * `package.json` and `Cargo.toml` produces a release whose update check never
 * fires, because the manifest's version is the one compared. Neither shows up
 * until a user is stuck on an old build.
 */

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const conf = read('src-tauri/tauri.conf.json');
const pkg = read('package.json');
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');

describe('updater configuration', () => {
  it('should have an updater plugin block', () => {
    expect(conf.plugins?.updater).toBeTruthy();
  });

  it('should carry a public key rather than a path to one', () => {
    // The plugin takes the key itself, not a filename — a path here fails at
    // runtime with "invalid public key", which reads like a corrupt key rather
    // than a config mistake.
    const key = conf.plugins.updater.pubkey;
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(40);
    expect(key).not.toMatch(/\.pub$|^~|^\//);
  });

  it('should use a minisign public key, which is what the signer produces', () => {
    /*
     * `tauri signer generate` writes a minisign public key: a base64 body whose
     * plaintext begins with the untrusted comment line naming the algorithm.
     * Decoding and checking that header is the difference between "a string is
     * present" and "a key the updater can actually verify with".
     */
    const decoded = Buffer.from(conf.plugins.updater.pubkey, 'base64').toString('utf8');
    expect(decoded).toMatch(/^untrusted comment: minisign public key/);
    expect(decoded).toMatch(/^RW[A-Za-z0-9+/=]+$/m);
  });

  it('should point at the latest release asset, not a pinned tag', () => {
    // `releases/latest/download/` is a GitHub redirect that always resolves to
    // the newest release. A pinned tag would serve the same file forever and no
    // install would ever see an update.
    const urls = conf.plugins.updater.endpoints;
    expect(Array.isArray(urls)).toBe(true);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\//);
      expect(url).toMatch(/releases\/latest\/download\//);
      expect(url).toMatch(/latest\.json$/);
    }
  });

  it('should produce updater artifacts, without which there is nothing to serve', () => {
    // Off by default. A build with this missing succeeds, produces an installer,
    // and publishes no `.sig` and no `latest.json` — the update channel exists
    // in the config and nowhere else.
    expect(conf.bundle.createUpdaterArtifacts).toBe(true);
  });

  it('should keep the NSIS target, which is what the updater can replace', () => {
    expect(conf.bundle.targets).toContain('nsis');
  });
});

describe('the version the updater compares', () => {
  /*
   * Three files carry the version and the updater only reads one of them at
   * runtime (the Cargo manifest, via the built binary). They disagreeing is
   * therefore not a cosmetic inconsistency: the release is tagged from
   * package.json, the installer is built from Cargo.toml, and the update check
   * compares against the binary's own version. A mismatch means a user on the
   * new build is still told they are up to date.
   */
  it('should be the same in package.json, tauri.conf.json and Cargo.toml', () => {
    const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
    expect(cargoVersion).toBe(pkg.version);
    expect(conf.version).toBe(pkg.version);
  });

  it('should be a plain three-part version the updater can order', () => {
    // The updater compares versions semantically. A `v` prefix or a fourth
    // component makes the comparison fall back to a string compare, where
    // "0.10.0" < "0.9.0".
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('the signing key is not in the repository', () => {
  it('should not track any private key', () => {
    // The whole security of the channel rests on this file staying out. Checked
    // against git's own view rather than the filesystem, because an untracked
    // key on a developer's disk is fine and a committed one is not.
    const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const keys = tracked.filter((f) => /\.key$|\.key\.pub$|\.pem$|minisign/i.test(f));
    expect(keys).toEqual([]);
  });

  it('should ignore key files by pattern, so a stray one cannot be added', () => {
    const ignore = readFileSync('.gitignore', 'utf8');
    expect(ignore).toMatch(/^\*\.key$/m);
  });
});

describe('the CI release workflow', () => {
  const workflow = '.github/workflows/release.yml';

  it('should exist', () => {
    expect(existsSync(workflow)).toBe(true);
  });

  it('should pass the signing key from secrets, never inline', () => {
    const yml = readFileSync(workflow, 'utf8');
    expect(yml).toMatch(/secrets\.TAURI_SIGNING_PRIVATE_KEY/);
    // A key written into the workflow would be in the repository, which is the
    // one thing the key must never be.
    expect(yml).not.toMatch(/TAURI_SIGNING_PRIVATE_KEY:\s*["']?[A-Za-z0-9+/]{40,}/);
  });

  it('should only run on a version tag', () => {
    const yml = readFileSync(workflow, 'utf8');
    expect(yml).toMatch(/tags:\s*\n?\s*-?\s*['"]?v\*/);
  });
});
