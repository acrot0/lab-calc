import React from 'react';
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
import { Cube } from '@phosphor-icons/react/dist/csr/Cube';
import { Drop } from '@phosphor-icons/react/dist/csr/Drop';
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
 * Phosphor's own weights, named so a call site reads as a choice.
 *
 * `regular` is the default and matches the weight of Inter's stems at these
 * sizes. `duotone` is for a glyph that carries a label rather than decorating
 * one. `bold` is for the smallest sizes, where a regular stroke disappears.
 */
export const WEIGHT = {
  thin: 'thin',
  light: 'light',
  regular: 'regular',
  bold: 'bold',
  fill: 'fill',
  duotone: 'duotone',
};

/**
 * Wrap a Phosphor icon with the project's size and weight.
 *
 * Returning a component rather than exporting the raw icon keeps the call sites
 * free of the decision: `import { Icons } from '../icons.jsx'` then
 * `<Icons.dilute size={ICON_SIZE.control} />`. A caller that passes a size is
 * choosing a role, not a number.
 */
function styled(Icon, defaultWeight = WEIGHT.regular) {
  return function StyledIcon({ size = ICON_SIZE.control, weight = defaultWeight, ...rest }) {
    return <Icon size={size} weight={weight} {...rest} />;
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
  weigh: styled(Flask, WEIGHT.duotone),
  dilute: styled(Eyedropper, WEIGHT.duotone),
  buffer: styled(TestTube, WEIGHT.duotone),
  // Phosphor has no plural TestTubes, and `Stack` is already the layers glyph.
  // `Rows` reads as a sequence of steps, which is what a serial dilution is —
  // the same tube, each one diluted from the last.
  series: styled(Rows, WEIGHT.duotone),
  ph: styled(Pulse, WEIGHT.duotone),
  percent: styled(Percent, WEIGHT.duotone),
  curve: styled(ChartLine, WEIGHT.duotone),
  reagent: styled(DropHalf, WEIGHT.duotone),
  spectro: styled(Sun, WEIGHT.duotone),
  lab: styled(Calculator, WEIGHT.duotone),
  colligative: styled(Thermometer, WEIGHT.duotone),
  reaction: styled(Scales, WEIGHT.duotone),
  electro: styled(Lightning, WEIGHT.duotone),
  elements: styled(Atom, WEIGHT.duotone),
  convert: styled(ArrowsLeftRight, WEIGHT.duotone),
  // The drawer, not the "Lab bench" tab — that one already owns Calculator, and
  // two controls wearing the same glyph in one topbar is not a distinction.
  calc: styled(MathOperations),

  // --- Chrome ---
  history: styled(ClockCounterClockwise),
  search: styled(MagnifyingGlass),
  remove: styled(Trash),
  replay: styled(ArrowCounterClockwise),
  download: styled(DownloadSimple),
  csv: styled(FileXls),
  markdown: styled(FileText),
  json: styled(FileCode),
  upload: styled(UploadSimple),
  warning: styled(Warning, WEIGHT.fill),
  notice: styled(ShieldWarning),
  check: styled(Check, WEIGHT.bold),
  close: styled(X),
  language: styled(Translate),
  // Frosted glass reads as a droplet; solid as a cube. Both are the shape of
  // the material rather than of the action, because the button is a state
  // display that happens to be clickable.
  frosted: styled(Drop),
  solid: styled(Cube),

  // --- Reserved for the visualisation phases ---
  // Declared here so the set stays the one place an icon is chosen.
  waves: styled(Waves),
  gauge: styled(Gauge),
  layers: styled(Stack),
  branch: styled(GitBranch),
  trend: styled(TrendUp),
  microscope: styled(Microscope),
  dna: styled(Dna),
  syringe: styled(Syringe),
  beaker: styled(Flask),
};
