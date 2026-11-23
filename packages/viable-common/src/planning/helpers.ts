import type { Specification, Workcard } from '@owlmeans/planning'
import type { WorkcardDraft } from '../areas/types.js'
import type { AgentProject, UserStory } from '../ba/types.js'
import type { WorkcardDesign } from '../design/types.js'
import type { WorkcardWriteInput } from '../metadata/types.js'
import { viableCardHelper } from './card.js'
import { viableSpecHelper } from './spec.js'
import type {
  WorkcardWriteContent, ViableProjectCard, ViableProjectFields, ViableWorkcard, ViableWorkcardFields,
} from './types.js'

/** @deprecated compat:factory-refactor — use `viableCardHelper.isViableProject(…)` */
export const isViableProject = (card?: Workcard | null): card is ViableProjectCard => viableCardHelper.isViableProject(card)

/** @deprecated compat:factory-refactor — use `viableCardHelper.isViableWorkcard(…)` */
export const isViableWorkcard = (card?: Workcard | null): card is ViableWorkcard => viableCardHelper.isViableWorkcard(card)

/** @deprecated compat:factory-refactor — use `viableCardHelper.isUserChannel(…)` */
export const isUserChannel = (channel?: string | null): boolean => viableCardHelper.isUserChannel(channel)

/** @deprecated compat:factory-refactor — use `viableCardHelper.projectFieldsOf(…)` */
export const projectFieldsOf = (card: Workcard): ViableProjectFields => viableCardHelper.projectFieldsOf(card)

/** @deprecated compat:factory-refactor — use `viableCardHelper.workcardFieldsOf(…)` */
export const workcardFieldsOf = (card: Workcard): ViableWorkcardFields => viableCardHelper.workcardFieldsOf(card)

/** @deprecated compat:factory-refactor — use `viableCardHelper.workcardDraftOf(…)` */
export const workcardDraftOf = (card: Workcard): WorkcardDraft => viableCardHelper.workcardDraftOf(card)

/** @deprecated compat:factory-refactor — use `viableCardHelper.userStoryOf(…)` */
export const userStoryOf = (card: Workcard, design?: WorkcardDesign | null): UserStory =>
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

/** @deprecated compat:factory-refactor — use `viableCardHelper.workcardWriteInputOf(…)` */
export const workcardWriteInputOf = (card: Workcard, content: WorkcardWriteContent): WorkcardWriteInput =>
  viableCardHelper.workcardWriteInputOf(card, content)
