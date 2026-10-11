import type { Specification, Workcard } from '@owlmeans/planning'
import type { StoryDraft } from '../areas/types.js'
import type { AgentProject, UserStory } from '../ba/types.js'
import type { StoryDesign } from '../design/types.js'
import type { StoryWriteInput } from '../metadata/types.js'
import { viableCardHelper } from './card.js'
import { viableSpecHelper } from './spec.js'
import type {
  StoryWriteContent, ViableProjectCard, ViableProjectFields, ViableStoryCard, ViableStoryFields,
} from './types.js'

/** @deprecated compat:factory-refactor — use `viableCardHelper.isViableProject(…)` */
export const isViableProject = (card?: Workcard | null): card is ViableProjectCard => viableCardHelper.isViableProject(card)

/** @deprecated compat:factory-refactor — use `viableCardHelper.isViableStory(…)` */
export const isViableStory = (card?: Workcard | null): card is ViableStoryCard => viableCardHelper.isViableStory(card)

/** @deprecated compat:factory-refactor — use `viableCardHelper.isUserChannel(…)` */
export const isUserChannel = (channel?: string | null): boolean => viableCardHelper.isUserChannel(channel)

/** @deprecated compat:factory-refactor — use `viableCardHelper.projectFieldsOf(…)` */
export const projectFieldsOf = (card: Workcard): ViableProjectFields => viableCardHelper.projectFieldsOf(card)

/** @deprecated compat:factory-refactor — use `viableCardHelper.storyFieldsOf(…)` */
export const storyFieldsOf = (card: Workcard): ViableStoryFields => viableCardHelper.storyFieldsOf(card)

/** @deprecated compat:factory-refactor — use `viableCardHelper.storyDraftOf(…)` */
export const storyDraftOf = (card: Workcard): StoryDraft => viableCardHelper.storyDraftOf(card)

/** @deprecated compat:factory-refactor — use `viableCardHelper.userStoryOf(…)` */
export const userStoryOf = (card: Workcard, design?: StoryDesign | null): UserStory =>
  viableCardHelper.userStoryOf(card, design)

/** @deprecated compat:factory-refactor — use `viableSpecHelper.currentSpecOf(…)` */
export const currentSpecOf = (specs: readonly Specification[], category: string): Specification | null =>
  viableSpecHelper.currentSpecOf(specs, category)

/** @deprecated compat:factory-refactor — use `viableSpecHelper.currentSpecBody(…)` */
export const currentSpecBody = (specs: readonly Specification[], category: string): string =>
  viableSpecHelper.currentSpecBody(specs, category)

/** @deprecated compat:factory-refactor — use `viableSpecHelper.projectBriefOf(…)` */
export const projectBriefOf = (project: Workcard, specs: readonly Specification[]): AgentProject =>
  viableSpecHelper.projectBriefOf(project, specs)

/** @deprecated compat:factory-refactor — use `viableCardHelper.storyWriteInputOf(…)` */
export const storyWriteInputOf = (card: Workcard, content: StoryWriteContent): StoryWriteInput =>
  viableCardHelper.storyWriteInputOf(card, content)
