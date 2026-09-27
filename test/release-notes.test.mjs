import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

/*
 * Release notes live in the repository, and the workflow refuses to release
 * without them.
 *
 * ## Why they are not generated
 *
 * The obvious idea is to cut the release body out of `CHANGELOG.md`, and it is
 * wrong. They are two different documents for two different readers: the
 * changelog is a terse English record for someone reading a diff, and the
 * release notes are Chinese prose arguing to a chemist why this version is
 * worth the interruption of installing it. v0.4.0 leads with the model-limits
 * notice; v0.5.0 explains a licence decision. No extractor produces that from
 * "### Added".
 *
 * A generated body was tried and produced English prose with a Chinese footer.
 *
 * ## Why they are in the repository
 *
 * A body typed into the GitHub web form exists only there — it is not in a
 * clone, not in a diff, and not reviewable before it is published. In
 * `docs/releases/` it is a file: the workflow checks it exists, checks it is
 * not a placeholder, and attaches it to the draft.
 */

const NOTES_DIR = 'docs/releases';

describe('release notes', () => {
  it('should have notes for every version that has a tag', () => {
    /*
     * The workflow fails a release whose notes are missing, so a gap here is a
     * tag that cannot be released. Backfilled from the published releases for
     * the versions that predate this convention — they were written by hand
     * into the release form, and the only copy was on GitHub.
     */
    const versions = readdirSync(NOTES_DIR)
      .filter((f) => /^v\d+\.\d+\.\d+\.md$/.test(f))
      .map((f) => f.slice(1, -3));
    expect(versions.length).toBeGreaterThan(5);
    for (const v of versions) {
      const body = readFileSync(`${NOTES_DIR}/v${v}.md`, 'utf8');
      expect(body.trim().length, `v${v} notes are empty`).toBeGreaterThan(400);
    }
  });

  it('should have notes for the current version, which is the next release', () => {
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
    const file = `${NOTES_DIR}/v${version}.md`;
    expect(existsSync(file), `${file} is missing — write it before tagging`).toBe(true);
  });

  it('should be written in Chinese, like the rest of the user-facing prose', () => {
    // The audience is a Chinese-reading chemistry student. An English body is
    // not a translation problem, it is the wrong document.
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
    const body = readFileSync(`${NOTES_DIR}/v${version}.md`, 'utf8');
    const cjk = (body.match(/[一-鿿]/g) ?? []).length;
    expect(cjk).toBeGreaterThan(200);
  });

  it('should carry the teaching-only disclaimer', () => {
    // Every surface a user can reach says it, and a release page is one.
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
    const body = readFileSync(`${NOTES_DIR}/v${version}.md`, 'utf8');
    expect(body).toMatch(/仅供教学/);
    expect(body).toMatch(/不可用于临床/);
  });

  it('should not be a copy of the English changelog', () => {
    // The mistake this whole arrangement exists to prevent: a release body that
    // is the changelog section pasted in, which reads as a diff summary rather
    // than as notes to a user.
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
    const body = readFileSync(`${NOTES_DIR}/v${version}.md`, 'utf8');
    const changelog = readFileSync('CHANGELOG.md', 'utf8');
    const section = changelog.slice(changelog.indexOf(`## [${version}]`));
    const firstParagraph = section.split('\n').find((l) => l.trim().length > 60)?.trim() ?? '';
    if (firstParagraph) expect(body).not.toContain(firstParagraph);
  });

  it('should be reachable from the workflow', () => {
    const yml = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(yml).toMatch(/docs\/releases/);
    // Attached, not merely checked: notes that exist but are never read are a
    // file nobody sees.
    expect(yml).toMatch(/notes-file/);
  });
});
