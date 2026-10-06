import type { GuestHomePlan, LandingBand, LandingMenuEntry, LandingSlot } from '../types.js'

/**
 * ONE reading of what a landing page draws, so the stamper, the menu and the link planner agree.
 *
 * Pure, IO-free and total over a stored plan of any age: every optional band may be absent or
 * `null`, and blank model text counts as absent.
 */
export interface LandingPlanHelper {
  /**
   * The bands a landing page draws, in the house order `LANDING_BAND_ORDER`.
   *
   * One presence rule per band:
   *
   * - `hero`, `features`, `problem` (problem and solution) — always;
   * - `steps` — at least one step with a title;
   * - `use-cases` — at least `LANDING_USE_CASES.min` titled cases;
   * - `differentiator` — at least `LANDING_CONTRAST.min` contrast rows filled on both sides,
   *   OR a title and a text: the band is a heading and a paragraph, and the table under them is
   *   drawn only when it has enough rows;
   * - `approach` — at least `LANDING_PRINCIPLES.min` titled principles;
   * - `testimonials` — at least two quotes;
   * - `about` — a title and a text;
   * - `closing` — whenever the plan carries one.
   */
  landingBandsOf: (home: GuestHomePlan) => LandingBand[]
  /**
   * The guest header menu a page draws.
   *
   * Keeps only entries whose band the page draws (and whose anchor exists), the first of each
   * anchor, in page order; caps the list at `max` (never below `LANDING_MENU.min`); then pads
   * to `LANDING_MENU.min` with `how`, `features` and the first other band the page draws. A
   * label falls back to the page's own section label, then to `LANDING_ANCHOR_LABELS`.
   */
  landingMenuOf: (home: GuestHomePlan, max?: number) => LandingMenuEntry[]
  /**
   * The buttons and links of a landing page that exist — the places a home link can attach to,
   * in page order.
   *
   * - `hero.cta` and `closing.primary` (with a closing) — only without a usable gate, which takes
   *   their place (`LANDING_GATE_SLOTS`);
   * - `hero.secondary` — only without a usable gate, and only when the plan labels it;
   * - `hero.browse`, `closing.secondary` — when the plan labels them;
   * - `closing.link.N` — one per titled closing card, at most two;
   * - `useCase.N` — one per drawn case, when the use-cases band is drawn.
   */
  homeSlotsOf: (home: GuestHomePlan) => LandingSlot[]
}
