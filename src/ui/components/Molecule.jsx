import React, { useEffect, useRef, useState } from 'react';
import { drawSmiles } from '../smiles.mjs';
import { useI18n } from '../LocaleContext.jsx';

/**
 * A molecular structure diagram, drawn from a SMILES string.
 *
 * The SVG element is created by React and handed to the drawing library to
 * fill, rather than the library inserting its own node. That keeps the element
 * inside React's tree, so it is removed on unmount and visible to the render
 * tests — a library-inserted node leaks and is invisible to every test this
 * project has.
 *
 * Redrawing on theme change is handled by the effect's dependency on `theme`:
 * the bond colours come from the palette's custom properties, so a theme switch
 * has to redraw rather than merely restyle. The SVG is empty between the
 * effect's clear and the redraw, which is one frame and not visible.
 */
export default function Molecule({ smiles, theme = 'dark', size = 320 }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ref.current) return undefined;
    /*
     * The renderer loads asynchronously, so the effect can outlive the
     * component: a user who types a SMILES string and immediately switches
     * tabs would otherwise have the promise resolve against an unmounted
     * element. `cancelled` is checked after the await, which is the only
     * point where that is possible.
     */
    let cancelled = false;
    drawSmiles(smiles, ref.current, document.documentElement)
      .then((ok) => { if (!cancelled) setFailed(!ok); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [smiles, theme]);

  return (
    <figure className="molecule">
      <svg
        ref={ref}
        className="molecule-svg"
        width={size}
        height={Math.round(size * 0.75)}
        viewBox={`0 0 ${size} ${Math.round(size * 0.75)}`}
        role="img"
        aria-label={t('molecule.label', { smiles })}
      />
      <figcaption className="molecule-caption">
        {failed ? t('molecule.unparsable') : smiles}
      </figcaption>
    </figure>
  );
}
