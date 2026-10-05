import { PlanningSchemaKind, type StatusFlowSchema, type WorkcardTypeSchema } from '@owlmeans/planning'

export interface Planned {
  kind: PlanningSchemaKind
  key: string
  definition: WorkcardTypeSchema | StatusFlowSchema
}
