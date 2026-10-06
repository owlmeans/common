import { IntrinsicStatus, WorkcardKind, type Workcard, type WorkcardQuery } from '@owlmeans/planning'
import { isViableStory, ProjectStoryNotFound, storyFieldsOf, VIABLE_STORY_TYPE, type ViableStoryCard } from '@owlmeans/viable-common'
import type { ToolDeps, StoryFilter } from './types.js'
import { LANDING_MARK } from './consts.js'
import type { StoryHelper } from './stories/types.js'

export const createStoryHelper = (): StoryHelper => {
  const storyQuery = (projectId: string, filter: StoryFilter = {}): WorkcardQuery => ({
    kind: WorkcardKind.Card,
    type: VIABLE_STORY_TYPE,
    parent: projectId,
    ...(filter.status != null ? { status: filter.status } : {}),
    // The area is the story's own field rather than a column of the card.
    ...(filter.area != null ? { fields: { area: filter.area } } : {}),
    ...(filter.q != null ? { q: filter.q } : {}),
  })

  const resolveStory = async (
    deps: Pick<ToolDeps, 'api'>, projectId: string, ref: string
  ): Promise<ViableStoryCard> => {
    const [byId, byCode] = await Promise.all([
      // A code is not an id, and a store may refuse it as malformed rather than as absent — either
      // way it is simply not the card this lookup is about.
      deps.api.planning.cards.load(ref).catch(() => null),
      // A model retyping a code sometimes lowercases it; the codes themselves are uppercase.
      deps.api.planning.cards.list({
        ...storyQuery(projectId), code: ref === ref.toUpperCase() ? ref : [ref, ref.toUpperCase()],
        page: 0, size: 1,
      }),
    ])

    if (isViableStory(byId) && byId.parent === projectId) {
      return byId
    }
    const found = byCode.items[0]
    if (isViableStory(found)) {
      return found
    }

    throw new ProjectStoryNotFound(ref)
  }


  const isLandingStory = (card: Workcard): boolean => storyFieldsOf(card).landing === true

  /** `2 planned, 1 in progress` — the page's cards per intrinsic state, zeros left out. */
  const intrinsicCounts = (items: readonly Workcard[]): string => {
    const counts = new Map<string, number>()
    for (const item of items) {
      counts.set(item.intrinsic, (counts.get(item.intrinsic) ?? 0) + 1)
    }

    return [IntrinsicStatus.Planned, IntrinsicStatus.InProgress, IntrinsicStatus.Closed]
      .filter(state => (counts.get(state) ?? 0) > 0)
      .map(state => `${counts.get(state)} ${state.replace('-', ' ')}`)
      .join(', ')
  }

  const renderStories = (items: readonly Workcard[], page: number, total: number): string =>
    items.length < 1
      ? 'No stories.'
      : `${items.length} of ${total} (page ${page}) — ${intrinsicCounts(items)}:\n`
        + items.map(item => {
          const fields = storyFieldsOf(item)

          return `  ${item.code ?? item.id ?? ''} · ${item.status}`
            + `${fields.primary ? ' · primary' : ''}`
            + `${fields.landing === true ? ` · ${LANDING_MARK}` : ''}`
            + `${item.fields?.area != null ? ` · ${fields.area}` : ''}\n      ${item.title.slice(0, 160)}`
        }).join('\n')

  return { storyQuery, resolveStory, isLandingStory, renderStories }
}

export const storyHelper = createStoryHelper()

/** @deprecated compat:factory-refactor — use `storyHelper.storyQuery(…)` */
export const storyQuery = (projectId: string, filter: StoryFilter = {}): WorkcardQuery => storyHelper.storyQuery(projectId, filter)
