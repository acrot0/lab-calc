/**
 * Which tabs the phone navigation shows, and how the rest are reached.
 *
 * ## Why this is data rather than a condition in the component
 *
 * The rule is a platform specification, not a preference, and it is the kind of
 * thing a later edit breaks by accident — adding a sixth item to the bar looks
 * harmless and violates the guideline every mobile platform shares. Keeping the
 * list here means `test/nav.test.mjs` can assert the count without rendering
 * anything.
 *
 * ## The rule
 *
 * Material 3 and the iOS Human Interface Guidelines both specify **3 to 5**
 * destinations in a bottom navigation bar, and both say that beyond five the
 * extras belong behind a "more" affordance rather than in the bar. This app has
 * sixteen tabs, so a bar of five plus a more panel is not a compromise — it is
 * what the guidelines prescribe.
 *
 * At 390px a bar of sixteen would give each item 24px, well under the 44px
 * touch floor. Five gives each 78px, which is comfortable.
 *
 * ## Why these five
 *
 * They are the screens a bench session starts from, in the order a session
 * moves through them: weigh the solid, dilute it, check the buffer and the pH,
 * and look up an element. The other eleven are things you reach for
 * deliberately, which is exactly what a more panel is for.
 */

/**
 * The tabs in the bottom bar, in order.
 *
 * Ids rather than tab objects, so this module does not have to import the icon
 * set and the tab components to say which five are shown — a list of strings
 * cannot accidentally pull a lazy chunk into the first paint.
 */
export const PRIMARY_TABS = ['weigh', 'dilute', 'buffer', 'ph', 'elements'];

/** Whether a tab belongs in the bottom bar. */
export function isPrimary(id) {
  return PRIMARY_TABS.includes(id);
}

/**
 * The tabs behind the more panel, in the order they are shown.
 *
 * Preserves the app's own tab order rather than sorting: the panel is a list of
 * the same destinations the rail shows, and re-ordering them here would make
 * the two navigations disagree about where a tab lives.
 */
export function secondaryTabs(tabs) {
  return tabs.filter((t) => !isPrimary(t.id));
}

/**
 * The five the bar shows, resolved to their tab entries.
 *
 * Returns them in `PRIMARY_TABS` order, and skips any id that no longer names a
 * tab — a renamed tab should leave a shorter bar, not an undefined icon that
 * crashes the render.
 */
export function primaryTabs(tabs) {
  return PRIMARY_TABS
    .map((id) => tabs.find((t) => t.id === id))
    .filter(Boolean);
}
