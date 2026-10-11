import { WorkcardKind } from '@owlmeans/planning'
import type { Workcard } from '@owlmeans/planning'
import { ProjectArea } from '../areas/consts.js'
import type { StoryDraft } from '../areas/types.js'
import type { UserStory } from '../ba/types.js'
import { storyDesignHelper } from '../design/story.js'
import type { StoryDesign } from '../design/types.js'
import type { StoryWriteInput } from '../metadata/types.js'
import { VIABLE_PROJECT_TYPE, VIABLE_STORY_TYPE, VIABLE_USER_CHANNELS } from './consts.js'
import { ProjectStoryMissconfigured } from './errors.js'
import type {
  StoryWriteContent, ViableProjectCard, ViableProjectFields, ViableStoryCard, ViableStoryFields,
} from './types.js'
import type { ViableCardHelper } from './card/types.js'

export const createViableCardHelper = (): ViableCardHelper => {
  const isViableProject = (card?: Workcard | null): card is ViableProjectCard =>
    card != null && card.kind === WorkcardKind.Project && card.type === VIABLE_PROJECT_TYPE

  const isViableStory = (card?: Workcard | null): card is ViableStoryCard =>
    card != null && card.kind === WorkcardKind.Card && card.type === VIABLE_STORY_TYPE

  const isUserChannel = (channel?: string | null): boolean =>
    channel != null && VIABLE_USER_CHANNELS.includes(channel)

  const projectFieldsOf = (card: Workcard): ViableProjectFields =>
    (card.fields ?? {}) as ViableProjectFields

  const storyFieldsOf = (card: Workcard): ViableStoryFields => {
    const fields = (card.fields ?? {}) as Partial<ViableStoryFields>

    return { ...fields, area: fields.area ?? ProjectArea.Guest, primary: fields.primary === true }
  }

  const storyDraftOf = (card: Workcard): StoryDraft =>
    ({ story: card.title, area: storyFieldsOf(card).area })

  const userStoryOf = (card: Workcard, design?: StoryDesign | null): UserStory => {
    const fields = storyFieldsOf(card)
    const base: UserStory = design != null
      ? storyDesignHelper.userStoryOfDesign(design)
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

  const storyWriteInputOf = (card: Workcard, content: StoryWriteContent): StoryWriteInput => {
    if (card.code == null || card.code === '') {
      throw new ProjectStoryMissconfigured('no-code')
    }
    const { status, ...rest } = content
    const fields = storyFieldsOf(card)

    return {
      ...rest,
      code: card.code,
      narrative: card.title,
      status: status ?? card.status,
      primary: fields.primary,
      ...(fields.landing === true ? { landing: true } : {}),
    }
  }

  return {
    isViableProject, isViableStory, isUserChannel, projectFieldsOf, storyFieldsOf, storyDraftOf, userStoryOf,
    storyWriteInputOf,
  }
}

export const viableCardHelper = createViableCardHelper()
