import type { Workcard, WorkcardQuery } from '@owlmeans/planning'
import type { ConnectStoryStatus, ViableStoryCard, ViableStoryTransition } from '@owlmeans/viable-common'
import type { StoryFilter, ToolDeps } from '../types.js'

/** A story moved through its flow: the card it was resolved to, and its domain status after. */
export interface StoryTransit {
  card: ViableStoryCard
  status: ConnectStoryStatus
}

/** A project's stories as the tools look them up and print them. */
export interface StoryHelper {
  /** The planning query for a project's stories, narrowed by whatever the tool was given. */
  storyQuery: (projectId: string, filter?: StoryFilter) => WorkcardQuery
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
  resolveStory: (deps: Pick<ToolDeps, 'api'>, projectId: string, ref: string) => Promise<ViableStoryCard>
  /**
   * Move a story through its flow — the story's `start`, `reset` or `complete` — and read its
   * domain status after.
   *
   * The move is a planning transition awaited to its COMMIT, because the commit is where the
   * platform refuses it (the wrong status, another story in progress, the balance) and where a
   * start begins its run. A commit that is merely late is no refusal: the transition is durable,
   * so the story status is still the answer — waiting out the host's ceiling would report a slow
   * platform as a broken server. A refusal is thrown, and no status is read to hide it.
   */
  transit: (
    deps: Pick<ToolDeps, 'api' | 'log'>, projectId: string, ref: string, transition: ViableStoryTransition, cause: string,
  ) => Promise<StoryTransit>
    /** Whether a story card is the project's landing gate story. */
  isLandingStory: (card: Workcard) => boolean
  /**
   * One page of stories as a parent agent reads it.
   *
   * The header counts the page by INTRINSIC state, which is what "how much is left" means across
   * flows — a failed story is still work to do. Every story line is the shape the connector has
   * always printed, so a parent that learned to read it keeps reading it: the code first, because it
   * is what every other story tool takes. A new fact is a new flag beside `primary`, never a
   * substitute for one, and the area stays last.
   */
  renderStories: (items: readonly Workcard[], page: number, total: number) => string
}
