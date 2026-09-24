import React from 'react';

/**
 * Hand-drawn SVG illustrations for empty states and the notice panel.
 *
 * Inline SVG rather than image files: they inherit `currentColor` and the CSS
 * custom properties, so they follow the theme without a second dark/light pair
 * of assets, and they cost nothing extra to download. They are also drawn with
 * the same accent colour as the app mark, so the empty state looks like part of
 * the product rather than a placeholder.
 *
 * Everything here is decorative — each illustration is marked aria-hidden and
 * the surrounding text carries the meaning.
 */

/** Shared wrapper: consistent sizing and the decorative role. */
function Art({ children, className = '', size = 96 }) {
  return (
    <svg
      className={`art ${className}`}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/**
 * An empty record book with a flask beside it — the history panel's empty
 * state. The idea is "nothing logged yet", not "error".
 */
export function ArtEmptyHistory() {
  return (
    <Art>
      {/* The book. */}
      <rect x="14" y="22" width="44" height="54" rx="4" className="art-line" />
      <path d="M22 22v54" className="art-line art-faint" />
      {/* Ruled lines, fading out toward the bottom — the page is blank. */}
      <path d="M30 36h20M30 44h20M30 52h12" className="art-line art-faint" />
      {/* The flask. */}
      <path
        d="M62 20h12v16l12 30a4 4 0 0 1-3.6 6H53.6a4 4 0 0 1-3.6-6l12-30V20Z"
        className="art-line"
      />
      <path d="M58 56h20" className="art-line art-faint" />
      <path d="M53.6 66h28.8" className="art-accent" />
      {/* A bubble. */}
      <circle cx="70" cy="50" r="3" className="art-accent" />
    </Art>
  );
}

/** A flask with liquid and rising bubbles — used where there is simply no data. */
export function ArtEmptySearch() {
  return (
    <Art size={72}>
      <circle cx="48" cy="30" r="14" className="art-line art-faint" />
      <path d="M44 30l8 0M48 26v8" className="art-line" />
      <path d="M16 74h64" className="art-line art-faint" />
    </Art>
  );
}

/** A conical flask mid-reaction — the notice panel's header mark. */
export function ArtReaction() {
  return (
    <Art size={64}>
      <path
        d="M36 12h24v20l16 40a5 5 0 0 1-4.6 7H24.6A5 5 0 0 1 20 72l16-40V12Z"
        className="art-line"
      />
      <path d="M28 56h40" className="art-faint" />
      <path d="M20 72h56l-.1.3a5 5 0 0 1-4.5 6.7H24.6A5 5 0 0 1 20 72Z" className="art-accent" />
      <circle cx="40" cy="64" r="3.5" className="art-accent" />
      <circle cx="56" cy="68" r="2.5" className="art-accent" />
      <circle cx="48" cy="58" r="2" className="art-accent" />
    </Art>
  );
}

/**
 * A molecule: a central atom with three bonds.
 *
 * Drawn with explicit bond lines rather than an icon font so the angles read as
 * chemistry rather than as a generic network glyph.
 */
export function ArtMolecule() {
  return (
    <Art size={64}>
      <path d="M48 48 26 30M48 48l22-18M48 48v22" className="art-line art-faint" />
      <circle cx="48" cy="48" r="8" className="art-accent" />
      <circle cx="24" cy="28" r="6" className="art-line" />
      <circle cx="72" cy="28" r="6" className="art-line" />
      <circle cx="48" cy="74" r="6" className="art-line" />
    </Art>
  );
}
