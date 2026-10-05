import type { PlanningSchemaRegistry, PlanningScope } from '../types.js'
import type { SchemaOrigin } from '../consts.js'

export interface FlowLookup extends Pick<PlanningSchemaRegistry, 'flow'> {}

export interface Scope extends Pick<PlanningScope, 'entityId'> {}

export interface Candidate<T> {
  origin: SchemaOrigin
  definition: T
  retired: boolean
}

export interface Resolved<T> {
  definitions: T[]
  origins: Record<string, SchemaOrigin>
  retired: string[]
}
