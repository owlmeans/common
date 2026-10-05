import {
  LANDING_ANCHOR_BAND, LANDING_ANCHOR_LABELS, LANDING_ANCHORS, LANDING_BAND_ORDER, LANDING_CONTRAST,
  LANDING_MENU, LANDING_PRINCIPLES, LANDING_USE_CASES,
} from './consts.js'
import type {
  GuestHomePlan, LandingAnchor, LandingBand, LandingMenuEntry, LandingSlot, ScaffoldPlan,
  ScaffoldStoryPlan,
} from './types.js'

/**
 * ONE reading of who owns a drawn artifact, so no consumer has to interpret the plan itself.
 *
 * The plan carries `sharesWidgetWith` / `sharesScreenWith` as untrusted hints — a model may drop
 * them, invent a code, point forwards, or build a cycle. These resolve all of that away, and
 * every one is TOTAL: a code the plan does not hold answers itself, which is the unshared
 * behaviour and therefore exactly today's drawn tree.
 *
 * Pure and IO-free. `fillScaffoldPlan` normalises a plan through them before anything is stamped,
 * so the stampers and the scaffold loop can read a plan that is already sane.
 */

/** Which field the arrow is being followed along. */
export type ShareKind = 'widget' | 'screen'

const pointerOf = (story: ScaffoldStoryPlan, kind: ShareKind): string | undefined =>
  kind === 'widget' ? story.sharesWidgetWith : story.sharesScreenWith

/**
 * The code whose artifact this story renders — itself when it owns one.
 *
 * Backward-only and bounded: an arrow is followed only to a story EARLIER in plan order, which
 * makes a cycle unrepresentable rather than merely unlikely, and makes the owner the earliest
 * member of its group. That is what keeps `widgetDefinition(owner)` stable — the name is a
 * function of one code, never of the group, so adding a member renames nothing.
 */
export const shareOwner = (
  plan: Pick<ScaffoldPlan, 'stories'>, code: string, kind: ShareKind = 'widget'
): string => {
  const order = new Map(plan.stories.map((story, index) => [story.code, index]))
  const byCode = new Map(plan.stories.map(story => [story.code, story]))

  let current = code
  // Bounded by the list length: every hop strictly decreases the plan index, so it terminates.
  for (let hop = 0; hop <= plan.stories.length; hop++) {
    const story = byCode.get(current)
    const target = story != null ? pointerOf(story, kind) : undefined
    if (story == null || target == null || target === '' || target === current) {
      return current
    }
    const here = order.get(current)
    const there = order.get(target)
    // Unknown, forward or self-referential — none of them is a group, so the story owns its own.
    if (here == null || there == null || there >= here) {
      return current
    }
    current = target
  }

  return current
}

/**
 * Owner code → every member, owner first, in plan order.
 *
 * The shape the stampers need: one artifact per entry, and the full member list for the notice
 * that names them.
 */
export const shareGroups = (
  plan: Pick<ScaffoldPlan, 'stories'>, kind: ShareKind = 'widget'
): Map<string, string[]> => {
  const groups = new Map<string, string[]>()
  for (const story of plan.stories) {
    const owner = shareOwner(plan, story.code, kind)
    const members = groups.get(owner) ?? []
    if (!members.includes(owner)) members.push(owner)
    if (!members.includes(story.code)) members.push(story.code)
    groups.set(owner, members)
  }

  return groups
}

/** Every story that renders this owner's artifact, owner first. Total: an owner alone answers `[code]`. */
export const shareMembers = (
  plan: Pick<ScaffoldPlan, 'stories'>, owner: string, kind: ShareKind = 'widget'
): string[] => shareGroups(plan, kind).get(owner) ?? [owner]

/** Whether this story draws the artifact, as opposed to rendering somebody else's. */
export const ownsShare = (
  plan: Pick<ScaffoldPlan, 'stories'>, code: string, kind: ShareKind = 'widget'
): boolean => shareOwner(plan, code, kind) === code

// ONE reading of what a landing page draws, so the stamper, the menu and the link planner agree.
// Pure, IO-free and total over a stored plan of any age: every optional band may be absent or
// `null`, and blank model text counts as absent.

const filled = (value: string | null | undefined): boolean => (value?.trim() ?? '') !== ''

/** The use cases a page draws: titled ones, at most {@link LANDING_USE_CASES}.max. */
const drawnUseCases = (home: GuestHomePlan) =>
  (home.useCases?.cases ?? []).filter(entry => filled(entry.title)).slice(0, LANDING_USE_CASES.max)

/** The closing link cards a page draws: titled ones, at most two. */
const drawnClosingLinks = (home: GuestHomePlan) =>
  (home.closing?.links ?? []).filter(entry => filled(entry.title)).slice(0, 2)

/** Whether the gate is drawn: a gate is a form, and one without fields is no gate at all. */
const usableGate = (home: GuestHomePlan): boolean =>
  home.gate != null && (home.gate.fields ?? []).length > 0

/**
 * One presence rule per band:
 *
 * - `hero`, `features`, `problem` (problem and solution) — always;
 * - `steps` — at least one step with a title;
 * - `use-cases` — at least {@link LANDING_USE_CASES}.min titled cases;
 * - `differentiator` — at least {@link LANDING_CONTRAST}.min contrast rows filled on both sides,
 *   OR a title and a text: the band is a heading and a paragraph, and the table under them is
 *   drawn only when it has enough rows;
 * - `approach` — at least {@link LANDING_PRINCIPLES}.min titled principles;
 * - `testimonials` — at least two quotes;
 * - `about` — a title and a text;
 * - `closing` — whenever the plan carries one.
 */
const BAND_PRESENT: Record<LandingBand, (home: GuestHomePlan) => boolean> = {
  hero: () => true,
  steps: home => (home.steps ?? []).some(step => filled(step.title)),
  features: () => true,
  'use-cases': home => drawnUseCases(home).length >= LANDING_USE_CASES.min,
  problem: () => true,
  differentiator: home => {
    const band = home.differentiator
    if (band == null) return false
    const rows = (band.contrast ?? []).filter(row => filled(row.usual) && filled(row.ours))

    return rows.length >= LANDING_CONTRAST.min || (filled(band.title) && filled(band.text))
  },
  approach: home =>
    (home.approach?.principles ?? []).filter(entry => filled(entry.title)).length >= LANDING_PRINCIPLES.min,
  testimonials: home => (home.testimonials ?? []).filter(entry => filled(entry.quote)).length >= 2,
  about: home => home.about != null && filled(home.about.title) && filled(home.about.text),
  closing: home => home.closing != null,
}

/** The bands a landing page draws, in the house order {@link LANDING_BAND_ORDER}. */
export const landingBandsOf = (home: GuestHomePlan): LandingBand[] =>
  LANDING_BAND_ORDER.filter(band => BAND_PRESENT[band](home))

/** The page's own section label for an anchor's band, when the plan wrote one. */
const sectionLabel = (home: GuestHomePlan, anchor: LandingAnchor): string | null | undefined => {
  const labels = home.labels ?? {}
  switch (anchor) {
    case 'how': return labels.steps
    case 'features': return labels.features
    case 'use-cases': return labels.useCases
    case 'why': return labels.differentiator
    case 'approach': return labels.approach
    case 'community': return labels.testimonials
    case 'about': return labels.about
  }
}

/**
 * The guest header menu a page draws.
 *
 * Keeps only entries whose band the page draws (and whose anchor exists), the first of each
 * anchor, in page order; caps the list at `max` (never below {@link LANDING_MENU}.min); then pads
 * to {@link LANDING_MENU}.min with `how`, `features` and the first other band the page draws. A
 * label falls back to the page's own section label, then to {@link LANDING_ANCHOR_LABELS}.
 */
export const landingMenuOf = (home: GuestHomePlan, max: number = LANDING_MENU.max): LandingMenuEntry[] => {
  const bands = landingBandsOf(home)
  const drawn = (anchor: LandingAnchor) =>
    LANDING_ANCHORS.includes(anchor) && bands.includes(LANDING_ANCHOR_BAND[anchor])
  const order = (anchor: LandingAnchor) => LANDING_ANCHORS.indexOf(anchor)
  const label = (anchor: LandingAnchor, own?: string | null): string => {
    const candidates = [own, sectionLabel(home, anchor)]
    const chosen = candidates.find(filled)

    return chosen?.trim() ?? LANDING_ANCHOR_LABELS[anchor]
  }

  const chosen: LandingMenuEntry[] = []
  for (const entry of home.menu ?? []) {
    if (entry == null || !drawn(entry.anchor) || chosen.some(kept => kept.anchor === entry.anchor)) {
      continue
    }
    chosen.push({ anchor: entry.anchor, label: label(entry.anchor, entry.label) })
  }
  chosen.sort((a, b) => order(a.anchor) - order(b.anchor))
  chosen.splice(Math.max(LANDING_MENU.min, max))

  const padding: LandingAnchor[] = ['how', 'features', ...LANDING_ANCHORS.filter(
    anchor => anchor !== 'how' && anchor !== 'features'
  )]
  for (const anchor of padding) {
    if (chosen.length >= LANDING_MENU.min) break
    if (drawn(anchor) && !chosen.some(kept => kept.anchor === anchor)) {
      chosen.push({ anchor, label: label(anchor) })
    }
  }

  return chosen.sort((a, b) => order(a.anchor) - order(b.anchor))
}

/**
 * The buttons and links of a landing page that exist — the places a home link can attach to,
 * in page order.
 *
 * - `hero.cta` and `closing.primary` (with a closing) — only without a usable gate, which takes
 *   their place ({@link LANDING_GATE_SLOTS});
 * - `hero.secondary` — only without a usable gate, and only when the plan labels it;
 * - `hero.browse`, `closing.secondary` — when the plan labels them;
 * - `closing.link.N` — one per titled closing card, at most two;
 * - `useCase.N` — one per drawn case, when the use-cases band is drawn.
 */
export const homeSlotsOf = (home: GuestHomePlan): LandingSlot[] => {
  const gate = usableGate(home)
  const slots: LandingSlot[] = []

  if (!gate) slots.push('hero.cta')
  if (!gate && filled(home.hero.secondary?.label)) slots.push('hero.secondary')
  if (filled(home.hero.browse?.label)) slots.push('hero.browse')

  if (BAND_PRESENT['use-cases'](home)) {
    drawnUseCases(home).forEach((_, index) => slots.push(`useCase.${index + 1}` as LandingSlot))
  }

  if (home.closing != null) {
    if (!gate) slots.push('closing.primary')
    if (filled(home.closing.secondary?.label)) slots.push('closing.secondary')
    drawnClosingLinks(home).forEach((_, index) => slots.push(`closing.link.${index + 1}` as LandingSlot))
  }

  return slots
}
