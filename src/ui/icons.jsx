import {
  Activity, AlertTriangle, ArrowLeftRight, Atom, Beaker, Calculator, Check,
  Download, Droplet, Droplets, Dna, FileSpreadsheet, FileText, FlaskConical,
  FlaskRound, Gauge, GitBranch, History, Languages, Layers, LineChart,
  Microscope, Percent, Pipette, RotateCcw, Scale, Search, ShieldAlert, Sun,
  Syringe, TestTube, TestTubes, Thermometer, Trash2, TrendingUp, Waves, X, Zap,
} from 'lucide-react';

/**
 * The icon set, in one place.
 *
 * Two problems this solves, both of which had already happened:
 *
 * Sizes had drifted to eight different values (12, 13, 14, 15, 19, 20, 64, 72)
 * with no rule behind any of them. An icon is a word in the interface's
 * typography, and a typography with eight sizes is not one. The scale here is
 * three steps, named for what they are for rather than how big they are.
 *
 * Two tabs shared one icon: "Dilute" and "Serial dilution" were both `Droplets`.
 * A tab bar is a navigation aid, and two entries that look identical are not
 * one. Every tab now has its own glyph, checked by a test.
 *
 * Stroke width is fixed rather than passed per call. Lucide's default of 2 is
 * tuned for a 24px glyph; at 14px it reads heavy against Inter's stems, so the
 * whole set uses 1.75 and stays visually consistent with the text beside it.
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

/** Lucide's 2 is tuned for 24px; this reads better at the sizes above. */
const STROKE = 1.75;

/**
 * Wrap a Lucide icon with the project's size and stroke.
 *
 * Returning a component rather than exporting the raw icon keeps the call sites
 * free of the decision: `import { Icons } from '../icons.jsx'` then
 * `<Icons.dilute size={ICON_SIZE.control} />`. A caller that passes a size is
 * choosing a role, not a number.
 */
function styled(Icon) {
  return function StyledIcon({ size = ICON_SIZE.control, ...rest }) {
    return <Icon size={size} strokeWidth={STROKE} {...rest} />;
  };
}

/**
 * Named by what the icon means in this app, not by what Lucide calls it.
 *
 * `Pipette` for dilution and `TestTubes` for a serial dilution are the same
 * shapes a bench chemist would reach for; the names here say which screen they
 * belong to, so a future change to the tab set does not have to reverse-engineer
 * a shape back into a meaning.
 */
export const Icons = {
  // --- Tabs ---
  weigh: styled(FlaskConical),
  dilute: styled(Pipette),
  buffer: styled(TestTube),
  series: styled(TestTubes),
  ph: styled(Activity),
  percent: styled(Percent),
  curve: styled(LineChart),
  reagent: styled(FlaskRound),
  spectro: styled(Sun),
  lab: styled(Calculator),
  colligative: styled(Thermometer),
  reaction: styled(Scale),
  electro: styled(Zap),
  elements: styled(Atom),
  convert: styled(ArrowLeftRight),

  // --- Chrome ---
  history: styled(History),
  search: styled(Search),
  remove: styled(Trash2),
  replay: styled(RotateCcw),
  download: styled(Download),
  csv: styled(FileSpreadsheet),
  markdown: styled(FileText),
  warning: styled(AlertTriangle),
  notice: styled(ShieldAlert),
  check: styled(Check),
  close: styled(X),
  language: styled(Languages),

  // --- Reserved for the visualisation phases ---
  // Declared here so the set stays the one place an icon is chosen.
  droplet: styled(Droplet),
  waves: styled(Waves),
  gauge: styled(Gauge),
  layers: styled(Layers),
  branch: styled(GitBranch),
  trend: styled(TrendingUp),
  microscope: styled(Microscope),
  dna: styled(Dna),
  syringe: styled(Syringe),
  beaker: styled(Beaker),
};
