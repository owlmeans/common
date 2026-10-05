import type { ScaffoldPlan, ScaffoldStoryPlan, ShareKind } from './types.js'
import type { ScaffoldShareHelper } from './share/types.js'

export const createScaffoldShareHelper = (): ScaffoldShareHelper => {
  const pointerOf = (story: ScaffoldStoryPlan, kind: ShareKind): string | undefined =>
    kind === 'widget' ? story.sharesWidgetWith : story.sharesScreenWith

  const shareOwner = (
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

  const shareGroups = (
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

  const shareMembers = (
    plan: Pick<ScaffoldPlan, 'stories'>, owner: string, kind: ShareKind = 'widget'
  ): string[] => shareGroups(plan, kind).get(owner) ?? [owner]

  const ownsShare = (
    plan: Pick<ScaffoldPlan, 'stories'>, code: string, kind: ShareKind = 'widget'
  ): boolean => shareOwner(plan, code, kind) === code

  return { shareOwner, shareGroups, shareMembers, ownsShare }
}

export const scaffoldShareHelper = createScaffoldShareHelper()
