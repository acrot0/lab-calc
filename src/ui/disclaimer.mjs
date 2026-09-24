/**
 * Educational-use notice.
 *
 * This is not legal boilerplate bolted on at the end. A solution calculator
 * that looks authoritative but models an ideal solution will be trusted further
 * than it deserves: it ignores activity coefficients, ignores temperature, and
 * uses a bisection solve that is approximate near an equivalence point. Someone
 * who prepares a reagent from it without checking has been misled by the
 * interface, and the interface is ours.
 *
 * So the notice names the specific limitations rather than gesturing at
 * "limitations". A user who knows what is missing can decide when the number is
 * good enough; a user told only "use at your own risk" learns nothing.
 *
 * The acknowledgement is stored so the notice does not have to be dismissed on
 * every visit — a notice people click past without reading is worse than none,
 * because it manufactures consent.
 */

export const ACK_KEY = 'lab-calc.disclaimer-ack.v1';

/** The substantive points, each in both languages. */
export const DISCLAIMER_POINTS = [
  {
    titleZh: '仅供教学与学习',
    titleEn: 'Educational use only',
    zh: '本工具用于教学演示与日常学习，帮助理解溶液配制的计算过程。它不是经过验证的分析软件。',
    en: 'This tool exists for teaching and study — to make the arithmetic of solution preparation legible. It is not validated analytical software.',
  },
  {
    titleZh: '不可用于临床、诊断或生产',
    titleEn: 'Not for clinical, diagnostic, or production use',
    zh: '请勿将计算结果用于临床诊断、患者诊疗、检验报告、药品生产、质量控制或任何有法规要求的场景。这些场景必须使用经过验证并受控的软件。',
    en: 'Do not use these results for patient care, clinical testing, pharmaceutical manufacturing, quality control, or any regulated setting. Those require validated and controlled software.',
  },
  {
    titleZh: '模型是简化的',
    titleEn: 'The model is simplified',
    zh: '按理想溶液处理：不考虑活度系数、温度影响、离子强度、CO₂ 溶解、溶剂体积收缩与杂质。滴定曲线在等当点附近为近似值。',
    en: 'Solutions are treated as ideal: activity coefficients, temperature effects, ionic strength, dissolved CO₂, volume contraction on mixing, and impurities are all ignored. Titration curves are approximate near an equivalence point.',
  },
  {
    titleZh: '请自行核对结果',
    titleEn: 'Verify results yourself',
    zh: '在用于任何实际配制前，请与教材、药典、试剂说明书或经核实的来源对照并核对结果。配液前请确认计算所用数据与手上试剂的实际情况相符。',
    en: 'Before preparing anything, check the result against a textbook, a pharmacopoeia, a reagent certificate, or another trusted source — and against the actual reagent you have on the bench.',
  },
];

function readFlag(store) {
  try {
    return store?.getItem(ACK_KEY) === '1';
  } catch {
    // A store that throws is a store we cannot trust to remember. Failing
    // toward "not acknowledged" re-shows the notice, which is the safe side.
    return false;
  }
}

export function hasAcknowledged(store) {
  return readFlag(store);
}

export function acknowledge(store) {
  try {
    store?.setItem(ACK_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function resetAcknowledgement(store) {
  try {
    store?.removeItem(ACK_KEY);
    return true;
  } catch {
    return false;
  }
}
