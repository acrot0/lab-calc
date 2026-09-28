import React from 'react';

/*
 * The space below a tab's form, before anything has been calculated.
 *
 * ## Why this exists
 *
 * `Result` returns `null` when it has no value, so a tab that has not been
 * calculated is a form with nothing under it. Measured at 1440×900, that gap
 * is not small on the four preparation tabs:
 *
 *     梯度稀释   440px
 *     稀释       414px
 *     称量配制   389px
 *     反应计量   342px
 *
 * The card is 700px tall, so on the dilution tab nearly 60% of it was empty.
 * On the other sixteen tabs the gap is 25–253px, which is ordinary breathing
 * room and gets nothing.
 *
 * ## Why it disappears rather than being replaced
 *
 * The illustration is a placeholder for a result, so it must not survive one.
 * It is rendered on `!out`, which is the same condition that makes `Result`
 * render nothing — the two cannot both be on screen, and no state has to be
 * tracked to keep them apart.
 *
 * ## Why the text is a hint and not a label
 *
 * The form above already says what the tab computes, in its own field labels.
 * Repeating that here would be noise. What the user does not know yet is what
 * the *result* will look like — so the line names the shape of the answer
 * ("the volume of stock and the volume of diluent"), which is the one thing
 * the form cannot tell them.
 *
 * It is `aria-hidden` along with the drawing: the form and its Calculate button
 * are the accessible path, and a screen reader announcing a decorative
 * placeholder before every calculation would be an obstacle, not a help.
 */
export default function TabEmpty({ art, hint }) {
  if (!art) return null;
  return (
    <div className="tab-empty" aria-hidden="true">
      {art}
      {hint && <p className="tab-empty-hint">{hint}</p>}
    </div>
  );
}
