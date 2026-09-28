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
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* The flask, drawn back to front: body fill, liquid, rim, highlight. */}
      <path
        d="M60 22h11v15l11 28.5a4 4 0 0 1-3.7 5.5H52.7A4 4 0 0 1 49 65.5L60 37V22Z"
        fill={`url(#${u}-glass)`}
        stroke="var(--accent)"
        strokeOpacity="0.6"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* The liquid level: a bright band at the surface reads as a meniscus. */}
      <path d="M56 52h19l5.5 14a3 3 0 0 1-2.8 4H53.3a3 3 0 0 1-2.8-4Z" fill="var(--accent)" opacity="0.55" />
      <path d="M56.6 52h17.8" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" />

      {/* Rising bubbles. */}
      <circle cx="63" cy="62" r="2.4" fill="var(--accent)" opacity="0.85" />
      <circle cx="69" cy="58" r="1.7" fill="var(--accent)" opacity="0.7" />

      {/* The neck highlight — the one detail that says "glass" rather than "shape". */}
      <path d="M62.5 25v10" stroke="white" strokeOpacity="0.5" strokeWidth="0.6" strokeLinecap="round" />
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
        strokeWidth="1.2"
      />
      <path d="M20 54v5a24 9 0 0 0 48 0v-5" stroke="var(--text-dim)" strokeOpacity="0.28" strokeWidth="1.2" />

      {/* The magnifier, tilted. */}
      <circle cx="38" cy="34" r="15" fill="var(--surface-2)" fillOpacity="0.5" />
      <circle cx="38" cy="34" r="15" stroke="var(--accent)" strokeWidth="2.4" strokeOpacity="0.85" />
      {/* Lens glint. */}
      <path d="M30 27a10 10 0 0 1 6-3" stroke="white" strokeOpacity="0.55" strokeWidth="0.6" strokeLinecap="round" />
      <path d="M49 45l9 9" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeOpacity="0.85" />
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
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Liquid, with a bright surface band. */}
      <path
        d="M31.5 52h33L74 68.5a3.5 3.5 0 0 1-3.2 4.9H25.2A3.5 3.5 0 0 1 22 68.5Z"
        fill={`url(#${u}-l)`}
      />
      <path d="M32 52h32" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />

      {/* Bubbles rising through the liquid. */}
      <circle cx="38" cy="63" r="3" fill="var(--accent)" opacity="0.9" />
      <circle cx="52" cy="68" r="2.2" fill="var(--accent)" opacity="0.75" />
      <circle cx="45" cy="57" r="1.6" fill="var(--accent)" opacity="0.65" />
      <circle cx="59" cy="61" r="1.3" fill="var(--accent)" opacity="0.55" />

      {/* Neck glint. */}
      <path d="M40.5 16v11" stroke="white" strokeOpacity="0.5" strokeWidth="0.6" strokeLinecap="round" />

      {/* The rim, drawn last so it sits above the body outline. */}
      <path d="M35 12h26" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
    </Art>
  );
}

/**
 * A balance, for the calculator's empty state.
 *
 * The calculator is the one screen whose empty state is reached by *not*
 * typing, so the illustration has to say "waiting for input" rather than
 * "nothing here". A balance with level pans reads as an instrument at rest:
 * the two pans are the two sides of an expression, and the beam is level
 * because nothing has been weighed yet.
 */
export function ArtBalance() {
  const u = useGradientId();
  return (
    <Art size={72}>
      <defs>
        <linearGradient id={`${u}-pan`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.42" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.14" />
        </linearGradient>
      </defs>

      <ellipse cx="48" cy="78" rx="24" ry="3.2" fill="var(--text-dim)" opacity="0.13" />

      {/* Column and base. */}
      <path d="M48 30v38" stroke="var(--text-dim)" strokeOpacity="0.5" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M34 70h28" stroke="var(--text-dim)" strokeOpacity="0.5" strokeWidth="2.4" strokeLinecap="round" />

      {/* The beam, level — the resting state. */}
      <path d="M20 30h56" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeOpacity="0.85" />
      <circle cx="48" cy="30" r="3.6" fill="var(--accent)" opacity="0.9" />

      {/* Two pans, hung from the beam ends. */}
      <path d="M20 30v6M76 30v6" stroke="var(--text-dim)" strokeOpacity="0.45" strokeWidth="1.2" />
      <path d="M12 36h16l-3 8a5 5 0 0 1-10 0Z" fill={`url(#${u}-pan)`} stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M68 36h16l-3 8a5 5 0 0 1-10 0Z" fill={`url(#${u}-pan)`} stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="1.2" strokeLinejoin="round" />
    </Art>
  );
}

/**
 * A graduated cylinder, for the converter's error state.
 *
 * Chosen over a second flask so the converter and the calculator do not share
 * a silhouette — two empty states that look alike make the user check which
 * one they are on. The graduations are what say "measurement" rather than
 * "container", so they are drawn on both the filled and the empty part.
 */
export function ArtCylinder() {
  const u = useGradientId();
  return (
    <Art size={72}>
      <defs>
        <linearGradient id={`${u}-cyl`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
          <stop offset="45%" stopColor="var(--accent)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.24" />
        </linearGradient>
      </defs>

      <ellipse cx="48" cy="80" rx="20" ry="3" fill="var(--text-dim)" opacity="0.13" />

      {/* Body: straight walls, so the graduations can be evenly spaced. */}
      <path
        d="M34 18h28v54a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4Z"
        fill={`url(#${u}-cyl)`}
        stroke="var(--accent)"
        strokeOpacity="0.55"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Liquid to just over half, with a surface line. */}
      <path d="M35 48h26v24a3 3 0 0 1-3 3H38a3 3 0 0 1-3-3Z" fill="var(--accent)" opacity="0.5" />
      <path d="M35.5 48h25" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" />

      {/* Graduations, shorter on the minor marks. */}
      <path
        d="M38 28h5M38 36h5M38 44h5M38 60h5M38 68h5"
        stroke="var(--text-dim)"
        strokeOpacity="0.5"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M38 24h9M38 56h9" stroke="var(--text-dim)" strokeOpacity="0.62" strokeWidth="1.2" strokeLinecap="round" />

      {/* The pour spout, which is what makes it read as a cylinder and not a tube. */}
      <path d="M34 18l-3-5h34l-3 5" stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M37 22v8" stroke="white" strokeOpacity="0.45" strokeWidth="0.6" strokeLinecap="round" />
    </Art>
  );
}

/**
 * Two beakers and an arrow between them — the converter's own mark.
 *
 * The only illustration here that shows an *operation* rather than an object,
 * because conversion is the one thing on this screen a picture can explain:
 * same amount, different markings. The two liquid levels are identical on
 * purpose — a conversion does not add or remove anything.
 */
export function ArtConvert() {
  const u = useGradientId();
  return (
    <Art size={64}>
      <defs>
        <linearGradient id={`${u}-b1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.36" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      <ellipse cx="48" cy="76" rx="34" ry="3.2" fill="var(--text-dim)" opacity="0.13" />

      {/* Left beaker. */}
      <path d="M10 26h26v42a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3Z" fill={`url(#${u}-b1)`} stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M11 48h24v20a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2Z" fill="var(--accent)" opacity="0.5" />
      <path d="M11.5 48h23" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" />

      {/* Right beaker, same level. */}
      <path d="M60 26h26v42a3 3 0 0 1-3 3H63a3 3 0 0 1-3-3Z" fill={`url(#${u}-b1)`} stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M61 48h24v20a2 2 0 0 1-2 2H63a2 2 0 0 1-2-2Z" fill="var(--accent)" opacity="0.5" />
      <path d="M61.5 48h23" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" />

      {/* The arrow, in the gap. */}
      <path d="M40 46h16" stroke="var(--text-mid)" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.8" />
      <path d="M52 41l5 5-5 5" stroke="var(--text-mid)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeOpacity="0.8" />
    </Art>
  );
}

/**
 * A volumetric flask, for the dilution tab's empty state.
 *
 * ## Why this shape and not a beaker
 *
 * The dilution tab's whole job is "take some stock, make it up to a mark", and
 * the volumetric flask is the one piece of glassware whose *shape* says that:
 * a long narrow neck with a single ring on it. A beaker would be a generic
 * chemistry picture; this one is the operation.
 *
 * The proportions are measured rather than invented. A 100 mL Class A flask is
 * specified at 7.5" tall, 2.3" at its widest and 0.65" across the neck, so:
 *
 *     height : widest      = 3.26 : 1
 *     neck   : widest      = 0.28 : 1
 *
 * Those are the numbers used below (68px tall → 20.9px wide → 5.8px neck).
 * They matter because the neck's slenderness is not styling: a small change in
 * liquid *height* in a narrow neck is a small change in *volume*, which is what
 * makes filling to the mark meaningful. A short fat neck would be a flask that
 * cannot do the thing the tab is about.
 *
 * ## The single ring
 *
 * One graduation mark, not several. A volumetric flask is calibrated to contain
 * one precise volume; several marks would make it a graduated cylinder, which
 * measures a range. Drawing it wrong would teach the wrong instrument.
 *
 * The ring is at the point the flask is filled to, so the liquid stops there.
 */
export function ArtFlask() {
  const u = useGradientId();
  return (
    <Art size={72}>
      <defs>
        <linearGradient id={`${u}-body`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
          <stop offset="45%" stopColor="var(--accent)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.26" />
        </linearGradient>
      </defs>

      <ellipse cx="48" cy="85" rx="14" ry="2.6" fill="var(--text-dim)" opacity="0.13" />

      {/* Pear-shaped body: flat base, widest at a third up, drawing in to the neck. */}
      <path
        d="M45.1 14h5.8v16.3c0 3.2 4.5 5.6 7.3 12.2 2 4.7 0.2 8.6-0.2 12.9-0.5 5-0.4 9.6-0.4 12.6H37.6c0-3 0.1-7.6-0.4-12.6-0.4-4.3-2.2-8.2-0.2-12.9 2.8-6.6 7.3-9 7.3-12.2V14Z"
        fill={`url(#${u}-body)`}
        stroke="var(--accent)"
        strokeOpacity="0.6"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />

      {/* Liquid, filled to the ring. Bright band at the surface reads as a level. */}
      <path
        d="M38.1 68.6c0-3 0.1-7.6-0.4-12.6-0.2-2-0.7-3.9-1-5.5h22.6c-0.3 1.6-0.8 3.5-1 5.5-0.5 5-0.4 9.6-0.4 12.6Z"
        fill="var(--accent)"
        opacity="0.42"
      />
      <path d="M36.7 50.5h22.6" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />

      {/* The single graduation ring, in the neck. */}
      <path d="M45.4 33.5h5.2" stroke="var(--text-dim)" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />

      {/* Stopper, drawn as a shallow trapezoid: a flask at rest is stoppered. */}
      <path
        d="M44.2 14l0.9-4h5.8l0.9 4"
        stroke="var(--accent)"
        strokeOpacity="0.6"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Neck glint — the detail that says glass rather than shape. */}
      <path d="M46.3 20v10" stroke="white" strokeOpacity="0.45" strokeWidth="0.6" strokeLinecap="round" />
    </Art>
  );
}

/**
 * A row of test tubes, for the serial dilution tab's empty state.
 *
 * ## What the picture has to say that the form does not
 *
 * Serial dilution is the one preparation where the *number of steps* is the
 * point: each tube takes from the one before it, so the concentration falls by
 * the same factor every time. A row of tubes whose liquid gets progressively
 * paler says that in one glance; a single vessel would say "dilution", which is
 * the neighbouring tab.
 *
 * ## Why the liquid fades rather than the level
 *
 * The volume in each tube is the same — that is what makes the series a series
 * and not just five different dilutions. So the levels are drawn equal and the
 * *colour* steps down. Drawing falling levels would state a procedure nobody
 * performs: you do not progressively empty the tubes.
 *
 * The first tube is the darkest because it holds the stock. The last is nearly
 * clear, which is what the far end of a five-step 10× series looks like.
 */
export function ArtTubes() {
  const u = useGradientId();
  const TUBES = [
    { x: 20, level: 54, opacity: 0.75 },
    { x: 34, level: 54, opacity: 0.62 },
    { x: 48, level: 54, opacity: 0.49 },
    { x: 62, level: 54, opacity: 0.36 },
    { x: 76, level: 54, opacity: 0.23 },
  ];
  return (
    <Art size={72}>
      <defs>
        <linearGradient id={`${u}-glass`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="45%" stopColor="var(--accent)" stopOpacity="0.07" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.22" />
        </linearGradient>
      </defs>

      {/* One ground shadow under the whole rack, not one per tube — they stand together. */}
      <ellipse cx="48" cy="83" rx="34" ry="3" fill="var(--text-dim)" opacity="0.13" />

      {/* The rack's back rail, so the tubes read as standing in something. */}
      <path d="M16 34h64" stroke="var(--text-dim)" strokeOpacity="0.3" strokeWidth="1.2" strokeLinecap="round" />

      {TUBES.map((tube) => (
        <g key={tube.x}>
          {/* Round-bottomed tube: the shape that distinguishes it from a cuvette. */}
          <path
            d={`M${tube.x} 26h8v48a4 4 0 0 1-4 4 4 4 0 0 1-4-4Z`}
            fill={`url(#${u}-glass)`}
            stroke="var(--accent)"
            strokeOpacity="0.55"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          {/* The liquid, level equal across the row; only the colour steps down. */}
          <path
            d={`M${tube.x + 1} ${tube.level}h6v20a3 3 0 0 1-3 3 3 3 0 0 1-3-3Z`}
            fill="var(--accent)"
            opacity={tube.opacity}
          />
          <path
            d={`M${tube.x + 1} ${tube.level}h6`}
            stroke="var(--accent)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          {/* Rim, drawn over the body outline. */}
          <path
            d={`M${tube.x - 0.5} 26h9`}
            stroke="var(--accent)"
            strokeOpacity="0.7"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          {/* A glint only on the first two: at this size five of them is noise. */}
          {tube.opacity > 0.6 && (
            <path
              d={`M${tube.x + 2.2} 30v9`}
              stroke="white"
              strokeOpacity="0.45"
              strokeWidth="0.6"
              strokeLinecap="round"
            />
          )}
        </g>
      ))}
    </Art>
  );
}
