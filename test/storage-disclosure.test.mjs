import { describe, it, expect } from 'vitest';
import { DISCLAIMER_POINTS } from '../src/ui/disclaimer.mjs';
import { DISCLAIMER_POINTS as X } from '../src/ui/disclaimer.mjs';
import { zh } from '../src/ui/locales/zh.mjs';
import { en } from '../src/ui/locales/en.mjs';

/*
 * The notice has to say where the records live.
 *
 * Every other point in `DISCLAIMER_POINTS` is about the arithmetic — how
 * precise it is, what it does not model, when not to trust it. None of them
 * said where the user's own data is kept, and that is the one fact about this
 * app that can cost someone their thesis: the history is in `localStorage`,
 * and the browser may clear it for reasons that have nothing to do with this
 * app.
 *
 * The iOS sentence is the specific one worth holding. WebKit's ITP deletes
 * **all** script-writable storage — localStorage included — after seven days
 * without user interaction, and `navigator.storage.persist()` does **not**
 * exempt it. Only a web app added to the home screen is exempt. A notice that
 * mentioned storage without that caveat would be advising an iOS user into the
 * exact situation it warns about.
 */

const point = DISCLAIMER_POINTS.find((p) => /本机|locally/.test(p.titleZh + p.titleEn));

describe('the notice names where the records are kept', () => {
  it('should have a point about local storage at all', () => {
    expect(point).toBeTruthy();
  });

  it('should say the records are on the device, not on a server', () => {
    const zhText = point.zh;
    expect(zhText).toMatch(/这台设备|本机/);
    expect(zhText).toMatch(/不上传|服务器/);
  });

  it('should name the ways the data can be lost', () => {
    // "May be cleared" without saying by what is a warning the user cannot act
    // on. Clearing browsing data and private windows are the two they can
    // recognise in their own behaviour.
    expect(point.zh).toMatch(/清理浏览器数据|浏览器数据/);
    expect(point.zh).toMatch(/无痕/);
  });

  it('should tell the user to export a backup, not just to be careful', () => {
    const zhText = point.zh;
    const enText = point.en;
    expect(zhText).toMatch(/导出|备份/);
    expect(enText).toMatch(/export|backup/i);
  });

  it('should state the iOS seven-day rule', () => {
    // The specific, checkable claim: without it the advice is generic
    // "back up your data", which is the kind of disclaimer nobody reads.
    expect(point.zh).toMatch(/7 天|七天/);
    expect(point.en).toMatch(/seven days|7 days/i);
  });

  it('should point at the home-screen install as the iOS fix', () => {
    // The rule has an actual remedy and naming it is the difference between
    // information and fatalism.
    expect(point.zh).toMatch(/主屏幕/);
    expect(point.en).toMatch(/home screen/i);
  });

  it('should not claim persist() protects the data', () => {
    // WebKit rejected the change that would have made `storage.persist()`
    // exempt an origin from ITP. Telling an iOS user otherwise would be a
    // false statement about a mechanism they cannot inspect.
    expect(point.zh).not.toMatch(/persist|持久化存储可以|已申请持久/);
  });

  it('should have both languages, and both non-trivial', () => {
    expect(point.zh.length).toBeGreaterThan(60);
    expect(point.en.length).toBeGreaterThan(80);
  });
});

describe('the points after this one are unaffected', () => {
  it('should keep the uncertainty point', () => {
    const unc = DISCLAIMER_POINTS.find((p) => p.titleEn === 'Results carry an uncertainty');
    expect(unc).toBeTruthy();
    expect(unc.zh).toMatch(/不确定度/);
  });

  it('should keep the model-limits point', () => {
    expect(DISCLAIMER_POINTS.find((p) => p.titleEn === 'The model is simplified')).toBeTruthy();
  });

  it('should not have introduced a duplicate title', () => {
    const titles = DISCLAIMER_POINTS.map((p) => p.titleEn);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

/*
 * Kept deliberately: the export path reads the same array, so a point that is
 * only in one language would render a Chinese paragraph inside an English
 * spreadsheet, or vanish from it entirely.
 */
describe('every point travels to the export', () => {
  it('should expose both languages for all points', () => {
    for (const p of DISCLAIMER_POINTS) {
      expect(p.zh?.trim(), `${p.titleEn} missing zh`).toBeTruthy();
      expect(p.en?.trim(), `${p.titleEn} missing en`).toBeTruthy();
    }
    expect(X).toBe(DISCLAIMER_POINTS);
  });
});

describe('the install prompt gives the real iOS reason', () => {
  it('should still mention offline use', () => {
    expect(zh.install.lead).toMatch(/离线/);
    expect(en.install.lead).toMatch(/offline/i);
  });

  it('should also mention that installing keeps the data on iOS', () => {
    // "Works offline" was the smaller half of the reason to install on iOS.
    expect(zh.install.lead).toMatch(/记录/);
    expect(en.install.lead).toMatch(/records|data|history/i);
  });

  it('should name the seven-day limit there too', () => {
    expect(zh.install.lead).toMatch(/7 天|七天/);
    expect(en.install.lead).toMatch(/7 days|seven days/i);
  });

  it('should say installing is exempt, not that installing also loses data', () => {
    // The exemption is the reason to install. A wording that implied the app
    // loses data either way would be worse than saying nothing.
    expect(zh.install.lead).toMatch(/不受此限|不受影响|豁免/);
    expect(en.install.lead).toMatch(/exempt|not affected|does not apply/i);
  });
});
