import type { ScaffoldPlan, ShareKind } from '../types.js'

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
export interface ScaffoldShareHelper {
  /**
   * The code whose artifact this story renders — itself when it owns one.
   *
   * Backward-only and bounded: an arrow is followed only to a story EARLIER in plan order, which
   * makes a cycle unrepresentable rather than merely unlikely, and makes the owner the earliest
   * member of its group. That is what keeps `widgetDefinition(owner)` stable — the name is a
   * function of one code, never of the group, so adding a member renames nothing.
   */
  shareOwner: (plan: Pick<ScaffoldPlan, 'stories'>, code: string, kind?: ShareKind) => string
  /**
   * Owner code → every member, owner first, in plan order.
   *
   * The shape the stampers need: one artifact per entry, and the full member list for the notice
   * that names them.
   */
  shareGroups: (plan: Pick<ScaffoldPlan, 'stories'>, kind?: ShareKind) => Map<string, string[]>
  /** Every story that renders this owner's artifact, owner first. Total: an owner alone answers `[code]`. */
  shareMembers: (plan: Pick<ScaffoldPlan, 'stories'>, owner: string, kind?: ShareKind) => string[]
  /** Whether this story draws the artifact, as opposed to rendering somebody else's. */
  ownsShare: (plan: Pick<ScaffoldPlan, 'stories'>, code: string, kind?: ShareKind) => boolean
}
