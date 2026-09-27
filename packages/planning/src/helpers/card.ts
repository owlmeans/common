import { WorkcardKind } from '../consts.js'
import type { Card, Project, Specification, Workcard, WorkcardDraft } from '../types.js'

export const isProject = (card?: Workcard | null): card is Project => card?.kind === WorkcardKind.Project

export const isCard = (card?: Workcard | null): card is Card => card?.kind === WorkcardKind.Card

export const isSpecification = (card?: Workcard | null): card is Specification =>
  card?.kind === WorkcardKind.Specification

/** `parents` with `parent` first and no repeats — the invariant every record keeps. */
export const normalizeParents = (parent?: string | null, parents?: string[] | null): string[] =>
  [...new Set([...(parent != null && parent !== '' ? [parent] : []), ...(parents ?? [])])]
    .filter(id => id !== '')

/** A draft with the collections every record carries filled in. */
export const cardDefaults = (draft: WorkcardDraft): WorkcardDraft & Required<Pick<WorkcardDraft, 'parents' | 'labels' | 'fields'>> => ({
  ...draft,
  parents: normalizeParents(draft.parent, draft.parents),
  labels: [...new Set(draft.labels ?? [])],
  fields: draft.fields ?? {},
})

/** A transition was allocated for the card and has not been folded yet. */
export const isPending = (card: Pick<Workcard, 'seq' | 'head'>): boolean => (card.head ?? card.seq) > card.seq

export const parentOf = (card: Workcard): string | undefined => card.parent ?? card.parents[0]

/**
 * The project a card belongs to: a project is its own; a card under a project is that project's;
 * anything deeper is its parent's project, which needs the parent to answer.
 */
export const projectOf = (card: Workcard, parent?: Workcard | null): string | undefined => {
  if (isProject(card)) {
    return card.id
  }
  if (parent != null) {
    return isProject(parent) ? parent.id : parent.parent
  }

  return card.parent
}
