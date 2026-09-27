import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/*
 * Every result panel must be able to show its working.
 *
 * The complaint was specific and it was right: "the newly added features have
 * no calculation process". Measured, four tabs rendered a result with no
 * `worked` prop — Physical, Uncertainty, Analytical and Stats. The other
 * sixteen had it, which is why the gap was easy to miss: the feature existed,
 * so it looked done, and the tabs that lacked it were the newer ones.
 *
 * This is the guard that makes the omission impossible rather than merely
 * fixed. A tab that renders `<Result>` without `worked` fails here, and the
 * message names the file and line — because the failure mode is not a crash,
 * it is a page that silently answers "how much" without ever saying "why".
 *
 * ## What counts as covered
 *
 * A `worked` prop, or an explicit entry in `EXEMPT` with a reason. The exempt
 * list is checked in both directions: naming a tab that has since gained
 * working fails too, so the list cannot quietly outlive its reasons.
 */

const TAB_DIR = 'src/ui/tabs';

/** Tabs that legitimately have no derivation, with the reason. */
const EXEMPT = {
  // Not calculations: they look up or convert, and there is no arithmetic whose
  // steps a reader could check.
  ConvertTab: '单位换算——读表，不是推导',
  ElementsTab: '元素周期表——查数据',
};

/** Every `<Result` opening tag in a file, with its line number. */
function resultTags(src) {
  const out = [];
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (!/<Result\b/.test(line)) return;
    out.push({ line: i + 1, text: line });
  });
  return out;
}

/**
 * Whether a `<Result` tag is followed by a `worked=` prop.
 *
 * JSX props can sit on any line up to the tag's close, so this reads forward
 * from the opening until the `/>` or `>` that ends it rather than looking at
 * the one line.
 */
function hasWorkedProp(src, startLine) {
  const lines = src.split('\n');
  for (let i = startLine - 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/\bworked\s*=/.test(line)) return true;
    // The tag ends at a self-close or at the `>` that opens the children.
    if (/\/>\s*$/.test(line) || /^\s*>\s*$/.test(line) || />\s*$/.test(line)) return false;
  }
  return false;
}

const files = readdirSync(TAB_DIR).filter((f) => f.endsWith('.jsx'));

describe('worked-step coverage', () => {
  it('should have tabs to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('should give every result panel a worked derivation, or an exemption', () => {
    const missing = [];
    for (const file of files) {
      const name = file.replace(/\.jsx$/, '');
      if (EXEMPT[name]) continue;
      const src = readFileSync(`${TAB_DIR}/${file}`, 'utf8');
      for (const tag of resultTags(src)) {
        if (!hasWorkedProp(src, tag.line)) missing.push(`${TAB_DIR}/${file}:${tag.line}`);
      }
    }
    expect(missing, `这些 Result 没有计算过程：\n${missing.join('\n')}`).toEqual([]);
  });

  it('should not exempt a tab that has working after all', () => {
    // An exemption that outlives its reason is a hole in the guard.
    const stale = [];
    for (const [name, why] of Object.entries(EXEMPT)) {
      const file = `${TAB_DIR}/${name}.jsx`;
      let src;
      try {
        src = readFileSync(file, 'utf8');
      } catch {
        stale.push(`${name} 已不存在（原因：${why}）`);
        continue;
      }
      if (/<Result\b[\s\S]{0,400}?\bworked\s*=/.test(src)) {
        stale.push(`${name} 已经有计算过程了，可以从 EXEMPT 移除（原因：${why}）`);
      }
    }
    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('should exempt only tabs that exist', () => {
    const names = new Set(files.map((f) => f.replace(/\.jsx$/, '')));
    for (const name of Object.keys(EXEMPT)) {
      expect(names.has(name), `${name} 不在 ${TAB_DIR}`).toBe(true);
    }
  });
});
