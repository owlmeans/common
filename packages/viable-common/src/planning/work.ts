import { WorkcardKind, type Workcard } from '@owlmeans/planning'
import { ProjectArea } from '../areas/consts.js'
import { VIABLE_CONTAINER_TYPES, VIABLE_FEATURE_TYPE, VIABLE_IMPROVEMENT_TYPE, VIABLE_SPEC_CARD_TYPE, VIABLE_TASK_TYPE, VIABLE_USER_STORY_TYPE, VIABLE_WORK_TYPES } from './consts.js'
import {
  ViableFeatureFieldsSchema, ViableImprovementFieldsSchema, ViableSpecCardFieldsSchema, ViableTaskFieldsSchema,
  ViableWorkcardFieldsSchema,
} from './schemas.js'
import type { AnyViableWorkCard, ViableWorkFields } from './types.js'
import type { ViableWorkHelper } from './work/types.js'

export const createViableWorkHelper = (): ViableWorkHelper => {
  const declared: Readonly<Record<string, readonly string[]>> = Object.freeze({
    [VIABLE_USER_STORY_TYPE]: Object.keys(ViableWorkcardFieldsSchema.properties),
    [VIABLE_SPEC_CARD_TYPE]: Object.keys(ViableSpecCardFieldsSchema.properties),
    [VIABLE_FEATURE_TYPE]: Object.keys(ViableFeatureFieldsSchema.properties),
    [VIABLE_IMPROVEMENT_TYPE]: Object.keys(ViableImprovementFieldsSchema.properties),
    [VIABLE_TASK_TYPE]: Object.keys(ViableTaskFieldsSchema.properties),
  })

  const isWorkType = (type?: string | null): boolean => type != null && VIABLE_WORK_TYPES.includes(type)

  const isWorkCard = (card?: Workcard | null): card is AnyViableWorkCard =>
    card != null && card.kind === WorkcardKind.Card && isWorkType(card.type)

  const isContainerType = (type?: string | null): boolean => type != null && VIABLE_CONTAINER_TYPES.includes(type)

  const isContainer = (card?: Workcard | null): card is AnyViableWorkCard => isWorkCard(card) && isContainerType(card.type)

  const containerIdOf = (card: Pick<Workcard, 'parent' | 'parents'>): string | undefined =>
    (card.parents ?? []).find(id => id !== (card.parent ?? card.parents?.[0]))

  const fieldsFor = (type: string, fields?: Record<string, unknown> | null): ViableWorkFields => {
    const keys = declared[type] ?? []
    const kept = Object.fromEntries(Object.entries(fields ?? {}).filter(([key, value]) => keys.includes(key) && value != null))
    if (type !== VIABLE_USER_STORY_TYPE) {
      return kept as ViableWorkFields
    }

    return {
      ...kept,
      area: typeof kept.area === 'string' && kept.area !== '' ? kept.area : ProjectArea.Guest,
      primary: kept.primary === true,
    } as ViableWorkFields
  }

  const unsetFor = (type: string, fields?: Record<string, unknown> | null): string[] => {
    const keys = declared[type] ?? []

    return Object.keys(fields ?? {}).filter(key => !keys.includes(key)).map(key => `fields.${key}`)
  }

  return { isWorkType, isWorkCard, isContainerType, isContainer, containerIdOf, fieldsFor, unsetFor }
}

export const viableWorkHelper = createViableWorkHelper()
