import { WorkcardKind } from '../consts.js'
import type { Card, Project, Specification, Workcard, WorkcardDraft } from '../types.js'
import type { CardHelper } from './card/types.js'

export const createCardHelper = (): CardHelper => {
  const isProject = (card?: Workcard | null): card is Project => card?.kind === WorkcardKind.Project

  const isCard = (card?: Workcard | null): card is Card => card?.kind === WorkcardKind.Card

  const isSpecification = (card?: Workcard | null): card is Specification =>
    card?.kind === WorkcardKind.Specification

  const normalizeParents = (parent?: string | null, parents?: string[] | null): string[] =>
    [...new Set([...(parent != null && parent !== '' ? [parent] : []), ...(parents ?? [])])]
      .filter(id => id !== '')

  const cardDefaults = (draft: WorkcardDraft): WorkcardDraft & Required<Pick<WorkcardDraft, 'parents' | 'labels' | 'fields'>> => ({
    ...draft,
    parents: normalizeParents(draft.parent, draft.parents),
    labels: [...new Set(draft.labels ?? [])],
    fields: draft.fields ?? {},
  })

  const isPending = (card: Pick<Workcard, 'seq' | 'head'>): boolean => (card.head ?? card.seq) > card.seq

  const parentOf = (card: Workcard): string | undefined => card.parent ?? card.parents[0]

  const projectOf = (card: Workcard, parent?: Workcard | null): string | undefined => {
    if (isProject(card)) {
      return card.id
    }
    if (parent != null) {
      return isProject(parent) ? parent.id : parent.parent
    }

    return card.parent
  }

  return { isProject, isCard, isSpecification, normalizeParents, cardDefaults, isPending, parentOf, projectOf }
}

export const cardHelper = createCardHelper()

/** @deprecated compat:factory-refactor — use `cardHelper.isProject(…)` */
export const isProject = (card?: Workcard | null): card is Project => cardHelper.isProject(card)

/** @deprecated compat:factory-refactor — use `cardHelper.isCard(…)` */
export const isCard = (card?: Workcard | null): card is Card => cardHelper.isCard(card)

/** @deprecated compat:factory-refactor — use `cardHelper.isSpecification(…)` */
export const isSpecification = (card?: Workcard | null): card is Specification => cardHelper.isSpecification(card)

/** @deprecated compat:factory-refactor — use `cardHelper.normalizeParents(…)` */
export const normalizeParents = (parent?: string | null, parents?: string[] | null): string[] =>
  cardHelper.normalizeParents(parent, parents)

/** @deprecated compat:factory-refactor — use `cardHelper.cardDefaults(…)` */
export const cardDefaults = (draft: WorkcardDraft): WorkcardDraft & Required<Pick<WorkcardDraft, 'parents' | 'labels' | 'fields'>> =>
  cardHelper.cardDefaults(draft)

/** @deprecated compat:factory-refactor — use `cardHelper.isPending(…)` */
export const isPending = (card: Pick<Workcard, 'seq' | 'head'>): boolean => cardHelper.isPending(card)

/** @deprecated compat:factory-refactor — use `cardHelper.parentOf(…)` */
export const parentOf = (card: Workcard): string | undefined => cardHelper.parentOf(card)

/** @deprecated compat:factory-refactor — use `cardHelper.projectOf(…)` */
export const projectOf = (card: Workcard, parent?: Workcard | null): string | undefined => cardHelper.projectOf(card, parent)
