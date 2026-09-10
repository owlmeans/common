import type { ScaffoldPlan, ScaffoldStoryPlan } from './types.js'

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
