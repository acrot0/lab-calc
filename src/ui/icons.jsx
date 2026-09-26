import React from 'react';
import { useIconWeight } from './icon-style-context.mjs';
import { normalize } from './icon-metrics.mjs';
/*
 * Imported per icon, not from the package barrel.
 *
 * `import { Flask } from '@phosphor-icons/react'` pulls in the whole index —
 * 3,024 icons — and the bundler cannot shake it back down, because the barrel
 * re-exports every one of them. Measured: the barrel cost 624 KB of JS against
 * 520 KB before, a 40 KB gzipped regression for 38 icons actually used.
 *
 * The subpath export is one module per icon, so only what is named here is
 * bundled. `sideEffects: false` in the package means the unused ones drop out
 * entirely.
 */
import { Flask } from '@phosphor-icons/react/dist/csr/Flask';
import { TestTube } from '@phosphor-icons/react/dist/csr/TestTube';
import { Rows } from '@phosphor-icons/react/dist/csr/Rows';
import { Pulse } from '@phosphor-icons/react/dist/csr/Pulse';
import { Percent } from '@phosphor-icons/react/dist/csr/Percent';
import { ChartLine } from '@phosphor-icons/react/dist/csr/ChartLine';
import { Sun } from '@phosphor-icons/react/dist/csr/Sun';
import { Calculator } from '@phosphor-icons/react/dist/csr/Calculator';
import { MathOperations } from '@phosphor-icons/react/dist/csr/MathOperations';
import { Thermometer } from '@phosphor-icons/react/dist/csr/Thermometer';
import { Scales } from '@phosphor-icons/react/dist/csr/Scales';
import { Lightning } from '@phosphor-icons/react/dist/csr/Lightning';
import { Atom } from '@phosphor-icons/react/dist/csr/Atom';
import { ArrowsLeftRight } from '@phosphor-icons/react/dist/csr/ArrowsLeftRight';
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/csr/ClockCounterClockwise';
import { MagnifyingGlass } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { Trash } from '@phosphor-icons/react/dist/csr/Trash';
import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise';
import { DownloadSimple } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { FileXls } from '@phosphor-icons/react/dist/csr/FileXls';
import { FileText } from '@phosphor-icons/react/dist/csr/FileText';
import { FileCode } from '@phosphor-icons/react/dist/csr/FileCode';
import { UploadSimple } from '@phosphor-icons/react/dist/csr/UploadSimple';
import { Warning } from '@phosphor-icons/react/dist/csr/Warning';
import { ShieldWarning } from '@phosphor-icons/react/dist/csr/ShieldWarning';
import { Check } from '@phosphor-icons/react/dist/csr/Check';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { Translate } from '@phosphor-icons/react/dist/csr/Translate';
import { DropHalf } from '@phosphor-icons/react/dist/csr/DropHalf';
import { Waves } from '@phosphor-icons/react/dist/csr/Waves';
import { Gauge } from '@phosphor-icons/react/dist/csr/Gauge';
import { Stack } from '@phosphor-icons/react/dist/csr/Stack';
import { GitBranch } from '@phosphor-icons/react/dist/csr/GitBranch';
import { TrendUp } from '@phosphor-icons/react/dist/csr/TrendUp';
import { Microscope } from '@phosphor-icons/react/dist/csr/Microscope';
import { Dna } from '@phosphor-icons/react/dist/csr/Dna';
import { Syringe } from '@phosphor-icons/react/dist/csr/Syringe';
import { Eyedropper } from '@phosphor-icons/react/dist/csr/Eyedropper';
import { Shapes } from '@phosphor-icons/react/dist/csr/Shapes';
import { DotsThreeOutline } from '@phosphor-icons/react/dist/csr/DotsThreeOutline';
import { Sidebar } from '@phosphor-icons/react/dist/csr/Sidebar';
import { CaretDoubleLeft } from '@phosphor-icons/react/dist/csr/CaretDoubleLeft';
import { GearSix } from '@phosphor-icons/react/dist/csr/GearSix';
import { Keyboard } from '@phosphor-icons/react/dist/csr/Keyboard';
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { Sigma } from '@phosphor-icons/react/dist/csr/Sigma';
import { ChartScatter } from '@phosphor-icons/react/dist/csr/ChartScatter';
import { WaveSine } from '@phosphor-icons/react/dist/csr/WaveSine';
import { Ruler } from '@phosphor-icons/react/dist/csr/Ruler';

/*
 * React is imported explicitly, not left to the JSX transform.
 *
 * The build uses the automatic runtime, which injects the binding and makes
 * this import look redundant. The test run does not, and compiled these
 * wrappers to `React.createElement(...)` with nothing named React in scope —
 * so every component using an icon threw `React is not defined` when rendered
 * outside the browser. The build was fine, which is exactly what made it hard
 * to find: the failure only existed in the environment meant to catch failures.
 *
 * The explicit import is correct under both transforms, so it is the fix
 * rather than a workaround.
 */

/**
 * The icon set, in one place.
 *
 * ## Why Phosphor rather than Lucide
 *
 * Lucide is a Feather fork with a single 2px stroke. That is a fine default and
 * it was the previous choice here, but it is one weight for every job: the same
 * line thickness on a 14px inline hint as on a 20px empty-state mark, and no
 * way to say "this one is active" except by changing its colour.
 *
 * Phosphor ships six weights — thin, light, regular, bold, fill, duotone — as a
 * *prop* on one component rather than six packages. `duotone` draws a soft
 * secondary shape behind the main stroke, which is what makes an icon read as
 * having depth at 16px without a second colour or a shadow. It is used here for
 * the tab glyphs, where the icon is the primary label.
 *
 * Both libraries are permissively licensed (Lucide ISC, Phosphor MIT), so this
 * is a quality decision, not a legal one.
 *
 * ## The two rules this file enforces
 *
 * Sizes had drifted to eight different values (12, 13, 14, 15, 19, 20, 64, 72)
 * with no rule behind any of them. An icon is a word in the interface's
 * typography, and a typography with eight sizes is not one. The scale is three
 * steps, named for what they are for rather than how big they are.
 *
 * Two tabs shared one icon: "Dilute" and "Serial dilution" were both `Droplets`.
 * A tab bar is a navigation aid, and two entries that look identical are not
 * one. Every tab now has its own glyph, checked by a test.
 */

/** Three sizes, by role. */
export const ICON_SIZE = {
  /** Inline with body text — labels, hints, footer. */
  inline: 14,
  /** Inside a control — tab buttons, icon buttons, selects. */
  control: 16,
  /** Standing alone — empty states, dialog marks. */
  display: 20,
};

/**
 * Wrap a Phosphor icon with the project's size, weight and optical normalisation.
 *
 * Returning a component rather than exporting the raw icon keeps the call sites
 * free of the decision: `import { Icons } from '../icons.jsx'` then
 * `<Icons.dilute size={ICON_SIZE.control} />`. A caller that passes a size is
 * choosing a role, not a number.
 *
 * ## The weight follows the user's icon-style preference
 *
 * There is no per-glyph default weight, and that is deliberate. The previous
 * version let each glyph carry one — tab icons drew `duotone`, status icons
 * `regular` — which was reasonable when the weight was fixed. Once the user can
 * choose, a per-glyph default becomes a lie: someone who picks "linear" and
 * still sees duotone tabs has been told the setting does something it does not.
 * So the style is global, and an explicit `weight` prop remains for the few
 * call sites that need a specific weight regardless of the preference.
 *
 * ## The normalisation is per-glyph and that is the point
 *
 * Phosphor draws its glyphs on a shared 256 grid but does not draw them to a
 * shared size or centre: measured across the 46 in use, the ink box runs from
 * 144×224 to 240×240 and one glyph's ink sits 20 units right of centre. A row
 * of them at one `size` therefore does not read as one set — which is what "the
 * icons look inconsistent" means when it is hard to point at.
 *
 * `normalize(key)` supplies a `viewBox` and a `transform` that scale the ink
 * box to a common target and centre it. Both props are passed only when the
 * glyph has a measurement, so a newly added icon renders the way Phosphor drew
 * it rather than with a correction invented for it. See `icon-metrics.mjs`.
 */
function styled(Icon, key) {
  return function StyledIcon({
    size = ICON_SIZE.control, weight: weightProp, ...rest
  }) {
    const preferred = useIconWeight();
    const viewBox = normalize(key);
    return (
      <Icon
        size={size}
        weight={weightProp ?? preferred}
        // Undefined for a glyph with no measurement, which leaves Phosphor's
        // own viewBox in place — the icon renders as drawn rather than with a
        // correction invented for it.
        viewBox={viewBox ?? undefined}
        {...rest}
      />
    );
  };
}

/**
 * Named by what the icon means in this app, not by what Phosphor calls it.
 *
 * `Eyedropper` for dilution and `TestTubes` for a serial dilution are the
 * shapes a bench chemist would reach for; the names here say which screen they
 * belong to, so a future change to the tab set does not have to reverse-engineer
 * a shape back into a meaning.
 */
export const Icons = {
  // --- Tabs ---
  // Duotone: on a tab the glyph is part of the label, so it carries more weight
  // than an inline hint does.
  weigh: styled(Flask, 'weigh'),
  dilute: styled(Eyedropper, 'dilute'),
  buffer: styled(TestTube, 'buffer'),
  // Phosphor has no plural TestTubes, and `Stack` is already the layers glyph.
  // `Rows` reads as a sequence of steps, which is what a serial dilution is —
  // the same tube, each one diluted from the last.
  series: styled(Rows, 'series'),
  ph: styled(Pulse, 'ph'),
  percent: styled(Percent, 'percent'),
  curve: styled(ChartLine, 'curve'),
  reagent: styled(DropHalf, 'reagent'),
  spectro: styled(Sun, 'spectro'),
  lab: styled(Calculator, 'lab'),
  colligative: styled(Thermometer, 'colligative'),
  reaction: styled(Scales, 'reaction'),
  electro: styled(Lightning, 'electro'),
  elements: styled(Atom, 'elements'),
  convert: styled(ArrowsLeftRight, 'convert'),
  // The drawer, not the "Lab bench" tab — that one already owns Calculator, and
  // two controls wearing the same glyph in one topbar is not a distinction.
  calc: styled(MathOperations, 'calc'),
  // The icon-style toggle. `Shapes` rather than a palette, because what is
  // being chosen is how the glyphs are drawn, not what colour they are.
  icons: styled(Shapes, 'icons'),

  // --- Chrome ---
  // The phone bar's overflow. `DotsThreeOutline` rather than `DotsThree`: the
  // outlined form is the one both platforms use for a "more" destination, and
  // the filled dots read as a menu button on a toolbar instead.
  more: styled(DotsThreeOutline, 'more'),
  // The rail's expand toggle, in both states: the sidebar glyph says what the
  // control acts on, and the chevron says which way it will move. One icon
  // that flipped meaning would be two glyphs wearing one name.
  expandNav: styled(Sidebar, 'expandNav'),
  collapseNav: styled(CaretDoubleLeft, 'collapseNav'),
  settings: styled(GearSix, 'settings'),
  caret: styled(CaretDown, 'caret'),
  // The keyboard-shortcut list. A keyboard glyph rather than a question mark:
  // the panel is a reference, and the glyph says what it is about.
  shortcuts: styled(Keyboard, 'shortcuts'),
  history: styled(ClockCounterClockwise, 'history'),
  search: styled(MagnifyingGlass, 'search'),
  remove: styled(Trash, 'remove'),
  replay: styled(ArrowCounterClockwise, 'replay'),
  download: styled(DownloadSimple, 'download'),
  csv: styled(FileXls, 'csv'),
  markdown: styled(FileText, 'markdown'),
  json: styled(FileCode, 'json'),
  upload: styled(UploadSimple, 'upload'),
  warning: styled(Warning, 'warning'),
  notice: styled(ShieldWarning, 'notice'),
  check: styled(Check, 'check'),
  close: styled(X, 'close'),
  language: styled(Translate, 'language'),

  /*
   * The four added with the analysis tabs.
   *
   * `Sigma` for the statistics tab because a summation sign is what a
   * descriptive statistic is; `ChartScatter` for the instrumental tab because
   * a calibration is a scatter with a line through it; `WaveSine` for physical
   * chemistry, where the recurring shape is a curve against a variable rather
   * than a molecule; `Ruler` for measurement uncertainty, which is what the
   * whole tab is about.
   */
  stats: styled(Sigma, 'stats'),
  analytical: styled(ChartScatter, 'analytical'),
  physical: styled(WaveSine, 'physical'),
  uncertainty: styled(Ruler, 'uncertainty'),

  // --- Reserved for the visualisation phases ---
  // Declared here so the set stays the one place an icon is chosen.
  waves: styled(Waves, 'waves'),
  gauge: styled(Gauge, 'gauge'),
  layers: styled(Stack, 'layers'),
  branch: styled(GitBranch, 'branch'),
  trend: styled(TrendUp, 'trend'),
  microscope: styled(Microscope, 'microscope'),
  dna: styled(Dna, 'dna'),
  syringe: styled(Syringe, 'syringe'),
  beaker: styled(Flask, 'beaker'),
};
