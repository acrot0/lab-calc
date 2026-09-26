import React from 'react';
import { Result } from './Fields.jsx';

/**
 * The tab panel, split into a form column and a results column.
 *
 * ## The bug this exists to fix
 *
 * The card used to be a single grid with results placed in column 2 by
 * `grid-column`. That reads correctly and is wrong: **CSS Grid shares row
 * heights between columns.** A tall result in column 2 stretched row 1 for both
 * columns, so the primary button — which belongs in column 1, above the fold —
 * was pushed down by the full height of the result. Measured: a 282px result
 * moved the button 212px. That is the "the whole layout jumps down when I open
 * a result" complaint, and no amount of tuning `grid-auto-flow` fixes it,
 * because the shared row is what a grid *is*.
 *
 * Two columns that scroll past each other need two flow contexts. So the split
 * happens here: column 1 is one container, column 2 is another, and neither can
 * affect the other's internal layout.
 *
 * ## Why a component rather than editing thirteen tabs
 *
 * Every tab already ends with its `<Result>` elements in source order, but not
 * contiguously — Convert has a `<figure>` between two of them, and three tabs
 * wrap everything in a fragment and switch on a mode. Hand-moving the results
 * in each would be thirteen chances to misplace one, and the next tab added
 * would have to remember. Partitioning the children here means a tab is written
 * exactly as it reads, and the layout is decided once.
 */
export default function Card({ className = '', children }) {
  /*
   * Flatten fragments first.
   *
   * A tab that renders `<>…</>` around its body would otherwise present one
   * child — the fragment — and every element inside it would land in the form
   * column, results included. Flattening is what lets a tab keep using a
   * fragment for a mode switch without thinking about this component.
   */
  const flat = [];
  const walk = (nodes) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === React.Fragment) {
        walk(child.props.children);
        return;
      }
      flat.push(child);
    });
  };
  walk(children);

  /*
   * Partition on the element type, not on rendered output.
   *
   * `Result` returns null when it has no value, so by the time anything is on
   * screen there is nothing to detect. The type is known before rendering, and
   * a `Result` that renders nothing simply contributes an empty container —
   * which is why the two-column layout is gated on `:has(.result)` in CSS and
   * collapses back to one column until there is something to show.
   */
  const results = flat.filter((c) => c.type === Result);
  const form = flat.filter((c) => c.type !== Result);

  return (
    <div className={`card${className ? ` ${className}` : ''}`}>
      <div className="card-main">{form}</div>
      {results.length > 0 && <div className="card-results">{results}</div>}
    </div>
  );
}
