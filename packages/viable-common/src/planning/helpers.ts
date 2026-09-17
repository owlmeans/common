import { WorkcardKind } from '@owlmeans/planning'
import type { Specification, Workcard } from '@owlmeans/planning'
import { ProjectArea } from '../areas/consts.js'
import type { StoryDraft } from '../areas/types.js'
import type { AgentProject, UserStory } from '../ba/types.js'
import { userStoryOfDesign } from '../design/helpers.js'
import type { StoryDesign } from '../design/types.js'
import type { StoryWriteInput } from '../metadata/types.js'
import {
  VIABLE_PROJECT_TYPE, VIABLE_STORY_TYPE, VIABLE_USER_CHANNELS, ViableSpecCategory,
} from './consts.js'
import { ProjectStoryMissconfigured } from './errors.js'
import type {
  StoryWriteContent, ViableProjectCard, ViableProjectFields, ViableStoryCard, ViableStoryFields,
} from './types.js'

/** A `viable:project` card — kind AND type, since a foreign provider may share either alone. */
export const isViableProject = (card?: Workcard | null): card is ViableProjectCard =>
  card != null && card.kind === WorkcardKind.Project && card.type === VIABLE_PROJECT_TYPE

/** A `viable:user-story` card. */
export const isViableStory = (card?: Workcard | null): card is ViableStoryCard =>
  card != null && card.kind === WorkcardKind.Card && card.type === VIABLE_STORY_TYPE

/** Whether a write came from a person (`web`, `connect`) rather than the platform's own runs. */
export const isUserChannel = (channel?: string | null): boolean =>
  channel != null && VIABLE_USER_CHANNELS.includes(channel)

export const projectFieldsOf = (card: Workcard): ViableProjectFields =>
  (card.fields ?? {}) as ViableProjectFields

/**
 * A story card's fields, with the two required ones always answered.
 *
 * An absent area reads as `guest` — the area that guards nothing — and an absent primary flag as
 * `false`, so a reader never branches on a card written by a store that dropped them.
 */
export const storyFieldsOf = (card: Workcard): ViableStoryFields => {
  const fields = (card.fields ?? {}) as Partial<ViableStoryFields>

  return { ...fields, area: fields.area ?? ProjectArea.Guest, primary: fields.primary === true }
}

/** The draft shape the analysis prompts and moderation take, from a card. */
export const storyDraftOf = (card: Workcard): StoryDraft =>
  ({ story: card.title, area: storyFieldsOf(card).area })

/**
 * The aggregate the coders take, for a story CARD.
 *
 * The card wins on the narrative, the code, the area and the actor — a person may have changed any
 * of them since the design was written. The design supplies what only it knows: the entities and
 * the screens. Without a design the aggregate has no screens yet.
 */
export const userStoryOf = (card: Workcard, design?: StoryDesign | null): UserStory => {
  const fields = storyFieldsOf(card)
  const base: UserStory = design != null
    ? userStoryOfDesign(design)
    : { story: card.title, area: fields.area, entity: null as unknown as string, entities: [], screens: [] }
  const code = card.code ?? base.code

  return {
    ...base,
    story: card.title,
    ...(code != null ? { code } : {}),
    area: fields.area,
    ...(fields.actor != null ? { actor: fields.actor } : {}),
  }
}

/**
 * The current document of one category among a card's specifications.
 *
 * The highest revision wins, then the most recently updated; a category nobody wrote answers
 * `null`.
 */
export const currentSpecOf = (
  specs: readonly Specification[], category: string,
): Specification | null =>
  specs
    .filter(spec => spec.category === category)
    .reduce<Specification | null>((best, spec) => {
      if (best == null) return spec
      const byRevision = (spec.revision ?? 0) - (best.revision ?? 0)
      if (byRevision !== 0) return byRevision > 0 ? spec : best

      return (spec.updatedAt ?? spec.createdAt) > (best.updatedAt ?? best.createdAt) ? spec : best
    }, null)

/** The body of a category's current document, `''` when there is none. */
export const currentSpecBody = (specs: readonly Specification[], category: string): string =>
  currentSpecOf(specs, category)?.body ?? ''

/**
 * The brief a generator reads, assembled from the project card and its specifications.
 *
 * `name` is the card's title and `alias` its code; a brief part nobody wrote is `''`, which is
 * what every prompt already treats as "not stated".
 */
export const projectBriefOf = (project: Workcard, specs: readonly Specification[]): AgentProject => {
  const { language } = projectFieldsOf(project)

  return {
    name: project.title,
    ...(project.code != null ? { alias: project.code } : {}),
    description: project.description ?? '',
    specification: currentSpecBody(specs, ViableSpecCategory.Specification),
    designSystem: currentSpecBody(specs, ViableSpecCategory.DesignSystem),
    vision: currentSpecBody(specs, ViableSpecCategory.Vision),
    ...(language != null ? { language } : {}),
  }
}

/**
 * What the metadata store writes to `docs/stories/<code>.md`, from the card and a run's content.
 *
 * The CODE is the target's only story identifier — a card id never reaches a target file — so a
 * story card without one is refused rather than filed under its id.
 */
export const storyWriteInputOf = (card: Workcard, content: StoryWriteContent): StoryWriteInput => {
  if (card.code == null || card.code === '') {
    throw new ProjectStoryMissconfigured('no-code')
  }
  const { status, ...rest } = content

  return {
    ...rest,
    code: card.code,
    narrative: card.title,
    status: status ?? card.status,
    primary: storyFieldsOf(card).primary,
  }
}
