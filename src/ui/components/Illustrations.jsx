import React, { useId } from 'react';

/**
 * Hand-drawn SVG illustrations for empty states and the notice panel.
 *
 * ## Why inline SVG rather than image files
 *
 * They inherit `currentColor` and the CSS custom properties, so one drawing
 * serves every theme — six palettes, dark and light — without a second asset
 * per theme. They cost nothing extra to download, and they cannot go stale
 * against the palette the way a baked PNG would.
 *
 * ## What makes these read as drawn rather than as icons
 *
 * An earlier version was flat 2px outlines. Outlines read as *icon*, which is
 * the wrong register for an empty state: an icon says "this control does
 * something", and an empty state says "nothing is here yet, and that is fine".
 *
 * Three things separate the two, and all three are used here:
 *
 * 1. **Gradients on the glass.** Real glassware is not a uniform colour; it
 *    catches light along one edge and falls dark along the other.
 * 2. **Liquid with a surface.** A fill that stops at a hard line reads as a
 *    shape; a fill with a lighter band at the top reads as a *level*, which is
 *    the thing a chemist recognises.
 * 3. **A ground shadow.** Everything sits on something. A soft ellipse under
 *    each object removes the "floating sticker" look at almost no cost.
 *
 * ## The gradient ids
 *
 * Every gradient needs an id, and the id has to be unique per mounted instance:
 * React renders these in more than one place, and duplicate ids mean the second
 * `<linearGradient>` is ignored and the first one's colours are used instead.
 * That failure is invisible until two instances are compared side by side.
 *
 * `useId` is called **once, at the top of each component** — never inside the
 * JSX. A hook called in a JSX expression is a Rules-of-Hooks violation, and
 * calling it several times per render would return several different ids, so
 * the defs and the references that point at them would disagree and every
 * gradient would silently render as none. The id is passed down as a plain
 * value instead.
 *
 * Everything is decorative — each illustration is `aria-hidden` and the
 * surrounding text carries the meaning.
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
 * `useId` returns something like ":r1:", and a colon is not valid in the
 * fragment of a `url(#...)` reference — the browser silently drops the whole
 * paint value, so the element renders unfilled with no error.
 */
function useGradientId() {
  return useId().replace(/:/g, '');
}

/**
 * The empty record book, with a flask beside it.
 *
 * The idea is "nothing logged yet", not "error" — so the book is open and
 * clean rather than closed or crossed out, and the flask is idle.
 */
export function ArtEmptyHistory() {
  const u = useGradientId();
  return (
    <Art>
      <defs>
        <linearGradient id={`${u}-glass`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
          <stop offset="42%" stopColor="var(--accent)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.26" />
        </linearGradient>
      </defs>

      {/* Ground shadow, so the objects sit on something. */}
      <ellipse cx="48" cy="84" rx="30" ry="3.5" fill="var(--text-dim)" opacity="0.13" />

      {/* The book: page block, then the ruled lines on top. */}
      <rect x="12" y="24" width="42" height="56" rx="3.5" fill="var(--surface-3)" />
      <rect x="12" y="24" width="42" height="56" rx="3.5" stroke="var(--text-dim)" strokeOpacity="0.45" />
      <rect x="15" y="27" width="36" height="50" rx="2" fill="var(--text-dim)" opacity="0.06" />
      <path d="M21 24v56" stroke="var(--text-dim)" strokeOpacity="0.35" strokeWidth="1.2" />

      {/* Ruled lines, shortening toward the bottom — a blank page, not a full one. */}
      <path
        d="M27 40h19M27 48h19M27 56h13"
        stroke="var(--text-dim)"
        strokeOpacity="0.3"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* The flask, drawn back to front: body fill, liquid, rim, highlight. */}
      <path
        d="M60 22h11v15l11 28.5a4 4 0 0 1-3.7 5.5H52.7A4 4 0 0 1 49 65.5L60 37V22Z"
        fill={`url(#${u}-glass)`}
        stroke="var(--accent)"
        strokeOpacity="0.6"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* The liquid level: a bright band at the surface reads as a meniscus. */}
      <path d="M56 52h19l5.5 14a3 3 0 0 1-2.8 4H53.3a3 3 0 0 1-2.8-4Z" fill="var(--accent)" opacity="0.55" />
      <path d="M56.6 52h17.8" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />

      {/* Rising bubbles. */}
      <circle cx="63" cy="62" r="2.4" fill="var(--accent)" opacity="0.85" />
      <circle cx="69" cy="58" r="1.7" fill="var(--accent)" opacity="0.7" />

      {/* The neck highlight — the one detail that says "glass" rather than "shape". */}
      <path d="M62.5 25v10" stroke="white" strokeOpacity="0.5" strokeWidth="1.6" strokeLinecap="round" />
    </Art>
  );
}

/**
 * No search results: a magnifier over an empty dish.
 *
 * Deliberately different in silhouette from the history empty state — two empty
 * states that look alike make the user check which one they are looking at.
 */
export function ArtEmptySearch() {
  const u = useGradientId();
  return (
    <Art size={72}>
      <defs>
        <radialGradient id={`${u}-dish`} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.06" />
        </radialGradient>
      </defs>

      <ellipse cx="44" cy="66" rx="26" ry="3.2" fill="var(--text-dim)" opacity="0.13" />

      {/* A petri dish, seen at an angle. */}
      <ellipse cx="44" cy="54" rx="24" ry="9" fill={`url(#${u}-dish)`} />
      <ellipse
        cx="44"
        cy="54"
        rx="24"
        ry="9"
        stroke="var(--text-dim)"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      <path d="M20 54v5a24 9 0 0 0 48 0v-5" stroke="var(--text-dim)" strokeOpacity="0.28" strokeWidth="1.5" />

      {/* The magnifier, tilted. */}
      <circle cx="38" cy="34" r="15" fill="var(--surface-2)" fillOpacity="0.5" />
      <circle cx="38" cy="34" r="15" stroke="var(--accent)" strokeWidth="2.4" strokeOpacity="0.85" />
      {/* Lens glint. */}
      <path d="M30 27a10 10 0 0 1 6-3" stroke="white" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
      <path d="M49 45l9 9" stroke="var(--accent)" strokeWidth="3.4" strokeLinecap="round" strokeOpacity="0.85" />
    </Art>
  );
}

/**
 * A conical flask mid-reaction — the notice panel's header mark.
 *
 * The most detailed of the set, because it is the one shown once on first run
 * and sets the impression of everything after it.
 */
export function ArtReaction() {
  const u = useGradientId();
  return (
    <Art size={64}>
      <defs>
        <linearGradient id={`${u}-g`} x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.40" />
          <stop offset="38%" stopColor="var(--accent)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.30" />
        </linearGradient>
        <linearGradient id={`${u}-l`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      <ellipse cx="48" cy="79" rx="26" ry="3.2" fill="var(--text-dim)" opacity="0.14" />

      {/* Body. */}
      <path
        d="M37 12h22v19l15.5 37a5 5 0 0 1-4.6 7H26.1a5 5 0 0 1-4.6-7L37 31V12Z"
        fill={`url(#${u}-g)`}
        stroke="var(--accent)"
        strokeOpacity="0.65"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* Liquid, with a bright surface band. */}
      <path
        d="M31.5 52h33L74 68.5a3.5 3.5 0 0 1-3.2 4.9H25.2A3.5 3.5 0 0 1 22 68.5Z"
        fill={`url(#${u}-l)`}
      />
      <path d="M32 52h32" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" />

      {/* Bubbles rising through the liquid. */}
      <circle cx="38" cy="63" r="3" fill="var(--accent)" opacity="0.9" />
      <circle cx="52" cy="68" r="2.2" fill="var(--accent)" opacity="0.75" />
      <circle cx="45" cy="57" r="1.6" fill="var(--accent)" opacity="0.65" />
      <circle cx="59" cy="61" r="1.3" fill="var(--accent)" opacity="0.55" />

      {/* Neck glint. */}
      <path d="M40.5 16v11" stroke="white" strokeOpacity="0.5" strokeWidth="1.8" strokeLinecap="round" />

      {/* The rim, drawn last so it sits above the body outline. */}
      <path d="M35 12h26" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" />
    </Art>
  );
}

/**
 * A molecule: a central atom with three bonds.
 *
 * Drawn with explicit bond lines rather than an icon font so the angles read as
 * chemistry rather than as a generic network glyph. The atoms are filled rather
 * than outlined, and each gets a highlight offset toward the same light, which
 * is what makes them read as spheres.
 */
export function ArtMolecule() {
  const u = useGradientId();
  return (
    <Art size={64}>
      <defs>
        <radialGradient id={`${u}-a`} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.55" />
        </radialGradient>
        <radialGradient id={`${u}-b`} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0%" stopColor="var(--text-mid)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--text-dim)" stopOpacity="0.30" />
        </radialGradient>
      </defs>

      <ellipse cx="48" cy="80" rx="22" ry="3" fill="var(--text-dim)" opacity="0.13" />

      {/* Bonds first, so the atoms overlap their ends. */}
      <path
        d="M48 48 26 30M48 48l22-18M48 48v24"
        stroke="var(--text-dim)"
        strokeOpacity="0.45"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Outer atoms, then the centre on top of them. */}
      <circle cx="24" cy="28" r="8" fill={`url(#${u}-b)`} />
      <circle cx="72" cy="28" r="8" fill={`url(#${u}-b)`} />
      <circle cx="48" cy="74" r="8" fill={`url(#${u}-b)`} />
      <circle cx="48" cy="48" r="11" fill={`url(#${u}-a)`} />

      {/* Each sphere gets the same highlight offset, so the light direction is
          consistent across the drawing rather than per-atom. */}
      <circle cx="44.5" cy="44.5" r="3" fill="white" opacity="0.4" />
      <circle cx="21" cy="25" r="2.2" fill="white" opacity="0.3" />
      <circle cx="69" cy="25" r="2.2" fill="white" opacity="0.3" />
      <circle cx="45" cy="71" r="2.2" fill="white" opacity="0.3" />
    </Art>
  );
}
