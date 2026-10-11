import { WorkcardKind, type Workcard } from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import type { FoldResult } from '@owlmeans/server-planning/store'

export const NOT_SPECIFICATION = { kind: { $ne: WorkcardKind.Specification } } as Criteria<Workcard>

export const EMPTY: FoldResult = Object.freeze({ card: null, folded: 0, failed: 0, followUp: false })
