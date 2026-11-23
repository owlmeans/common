import { WorkcardKind } from '@owlmeans/planning'
import type { Workcard } from '@owlmeans/planning'
import { ProjectArea } from '../areas/consts.js'
import type { WorkcardDraft } from '../areas/types.js'
import type { UserStory } from '../ba/types.js'
import { workcardDesignHelper } from '../design/workcard.js'
import type { WorkcardDesign } from '../design/types.js'
import type { WorkcardWriteInput } from '../metadata/types.js'
import { VIABLE_PROJECT_TYPE, VIABLE_USER_STORY_TYPE, VIABLE_USER_CHANNELS } from './consts.js'
import { ProjectWorkcardMissconfigured } from './errors.js'
import type {
  WorkcardWriteContent, ViableProjectCard, ViableProjectFields, ViableWorkcard, ViableWorkcardFields,
} from './types.js'
import type { ViableCardHelper } from './card/types.js'

export const createViableCardHelper = (): ViableCardHelper => {
  const isViableProject = (card?: Workcard | null): card is ViableProjectCard =>
    card != null && card.kind === WorkcardKind.Project && card.type === VIABLE_PROJECT_TYPE

  const isViableWorkcard = (card?: Workcard | null): card is ViableWorkcard =>
    card != null && card.kind === WorkcardKind.Card && card.type === VIABLE_USER_STORY_TYPE

  const isUserChannel = (channel?: string | null): boolean =>
    channel != null && VIABLE_USER_CHANNELS.includes(channel)

  const projectFieldsOf = (card: Workcard): ViableProjectFields =>
    (card.fields ?? {}) as ViableProjectFields

  const workcardFieldsOf = (card: Workcard): ViableWorkcardFields => {
    const fields = (card.fields ?? {}) as Partial<ViableWorkcardFields>

    return { ...fields, area: fields.area ?? ProjectArea.Guest, primary: fields.primary === true }
  }

  const workcardDraftOf = (card: Workcard): WorkcardDraft =>
    ({ story: card.title, area: workcardFieldsOf(card).area })

  const userStoryOf = (card: Workcard, design?: WorkcardDesign | null): UserStory => {
    const fields = workcardFieldsOf(card)
    const base: UserStory = design != null
      ? workcardDesignHelper.userStoryOfDesign(design)
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

  const workcardWriteInputOf = (card: Workcard, content: WorkcardWriteContent): WorkcardWriteInput => {
    if (card.code == null || card.code === '') {
      throw new ProjectWorkcardMissconfigured('no-code')
    }
    const { status, ...rest } = content
    const fields = workcardFieldsOf(card)

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
    isViableProject, isViableWorkcard, isUserChannel, projectFieldsOf, workcardFieldsOf, workcardDraftOf, userStoryOf,
    workcardWriteInputOf,
  }
}

export const viableCardHelper = createViableCardHelper()
