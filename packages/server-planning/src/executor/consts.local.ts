import { TransitionAction } from '@owlmeans/planning'

/** The field a create's draft writes once and nothing moves afterwards. */
export const CREATOR = 'createdBy'

export const TRIMMED = ['title', 'description', 'code'] as const

export const ACTIONS = new Set<string>(Object.values(TransitionAction))
