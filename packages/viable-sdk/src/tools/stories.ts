import { IntrinsicStatus, WorkcardKind } from '@owlmeans/planning'
import type { Workcard, WorkcardQuery } from '@owlmeans/planning'
import {
  isViableStory, ProjectStoryNotFound, storyFieldsOf, VIABLE_STORY_TYPE,
} from '@owlmeans/viable-common'
import type { ViableStoryCard } from '@owlmeans/viable-common'
import type { ToolDeps } from './types.js'

/** What a story tool filters a project's stories by. */
export interface StoryFilter {
  status?: string
  area?: string
  q?: string
}

/**
 * The order a project's stories are read in: the flow order, then creation.
 *
 * `order` is the analysis's ordinal — a connective story sits between two flow steps at a
 * fraction — and a story somebody added by hand may carry none, so creation breaks the tie.
 */
export const STORY_ORDER: NonNullable<WorkcardQuery['sort']> = [
  { field: 'order', order: 'asc' },
  { field: 'createdAt', order: 'asc' },
]

/** The planning query for a project's stories, narrowed by whatever the tool was given. */
export const storyQuery = (projectId: string, filter: StoryFilter = {}): WorkcardQuery => ({
  kind: WorkcardKind.Card,
  type: VIABLE_STORY_TYPE,
  parent: projectId,
  ...(filter.status != null ? { status: filter.status } : {}),
  // The area is the story's own field rather than a column of the card.
  ...(filter.area != null ? { fields: { area: filter.area } } : {}),
  ...(filter.q != null ? { q: filter.q } : {}),
})

/**
 * The story a tool's `storyId` names — a CODE usually, a card id sometimes.
 *
 * `list_stories` prints the code, because the code is the handle every generated file names a
 * story by, so that is what a parent passes back; a parent holding an id from a structured result
 * passes that. Both are asked at once and the id wins, and neither answers for a story of another
 * project: a card id is global, and an id that belongs elsewhere is not a story of THIS project.
 *
 * @throws {ProjectStoryNotFound} when neither names a story of the project
 */
export const resolveStory = async (
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

/**
 * What marks the project's LANDING GATE story, in a story line and in a story's own status.
 *
 * The platform picks at most one story per project — the key step of the end user's workflow — and
 * draws a sketch of it on the guest home in place of the hero's call-to-action buttons: a visitor
 * starts it there without an account, and signing in carries their choices to the story's
 * full-scale screen. It is recorded as `fields.landing` on the story card, so the tools read it from
 * the card they already hold, never from a second call.
 *
 * Said because it changes what developing the story does — the development also replaces the
 * guest-home sketch with the real component — and a parent that reads only the narrative has no
 * way to know that.
 */
export const LANDING_MARK = 'landing gate'
export const LANDING_NOTE = 'landing gate story — a guest starts it on the guest home without an'
  + ' account, and signing in carries their choices to its full screen; developing it also puts the'
  + ' real component on the guest home'

/** Whether a story card is the project's landing gate story. */
export const isLandingStory = (card: Workcard): boolean => storyFieldsOf(card).landing === true

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

/**
 * One page of stories as a parent agent reads it.
 *
 * The header counts the page by INTRINSIC state, which is what "how much is left" means across
 * flows — a failed story is still work to do. Every story line is the shape the connector has
 * always printed, so a parent that learned to read it keeps reading it: the code first, because it
 * is what every other story tool takes. A new fact is a new flag beside `primary`, never a
 * substitute for one, and the area stays last.
 */
export const renderStories = (items: readonly Workcard[], page: number, total: number): string =>
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
