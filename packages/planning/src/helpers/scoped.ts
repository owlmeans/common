import type { AssigneeTypeSchema } from '../resources/types.js'
import { AssigneeTypeSchemaSchema } from '../schemas.js'
import { memoHelper } from '@owlmeans/context'
import { PlanningSchemaKind, SchemaOrigin, WorkcardKind } from '../consts.js'
import { PlanningUnsupported, SchemaInvalid, SchemaSealed } from '../errors.js'
import { makeSchemaRegistry } from '../registry.js'
import { StatusFlowSchemaSchema, WorkcardTypeSchemaSchema } from '../schemas.js'
import type {
  AnyTypeSchema, PlanningSchemaBundle, PlanningSchemaRegistry, SchemaScope, ScopedSchemaBundle,
  ScopedSchemaRecord, ScopedSchemaRegistry, StatusFlowSchema, WorkcardTypeSchema,
} from '../types.js'
import type { ScopedSchemaHelper } from './scoped/types.js'
import type { Candidate, Resolved } from './types.local.js'
import { makeAjv, validateHelper } from './validate.js'

const messageOf = (error: unknown): string => error instanceof Error ? error.message : `${error}`

export const createScopedSchemaHelper = (): ScopedSchemaHelper => {
  const checkers = memoHelper.once(() => {
    const ajv = makeAjv()
    return { flow: ajv.compile(StatusFlowSchemaSchema), type: ajv.compile(WorkcardTypeSchemaSchema), assignee: ajv.compile(AssigneeTypeSchemaSchema) }
  })

  const schemaRecordKey = (record: Pick<ScopedSchemaRecord, 'entityId' | 'project' | 'kind' | 'key'>): string =>
    `${record.entityId}\u0000${record.project ?? ''}\u0000${record.kind}\u0000${record.key}`

  const schemaKeyOf = (kind: PlanningSchemaKind, definition: WorkcardTypeSchema | StatusFlowSchema | AssigneeTypeSchema): string =>
    kind !== PlanningSchemaKind.Flow ? (definition as WorkcardTypeSchema).type : (definition as StatusFlowSchema).id

  const openType = (type: AnyTypeSchema): boolean => type.kind === WorkcardKind.Card && type.overridable === true

  const assertOverridable = (
    code: Pick<PlanningSchemaRegistry, 'has' | 'type' | 'flows' | 'assigneeTypes'>, kind: PlanningSchemaKind, key: string
  ): void => {
    if (kind === PlanningSchemaKind.AssigneeType) {
      const schema = code.assigneeTypes().find(schema => schema.type === key)
      if (schema != null && schema.overridable !== true) throw new SchemaSealed(`assignee:${key}`)
      return
    }
    if (kind === PlanningSchemaKind.Type) {
      if (code.has(key) && !openType(code.type(key))) {
        throw new SchemaSealed(`type:${key}`)
      }
      return
    }
    const flow = code.flows().find(entry => entry.id === key)
    if (flow != null && flow.overridable !== true) {
      throw new SchemaSealed(`flow:${key}`)
    }
  }

  const assertAssigneeTypeSchema = (schema: AssigneeTypeSchema): void => {
    const validate = checkers().assignee
    if (!validate(schema)) throw new SchemaInvalid(`assignee:${(schema as Partial<AssigneeTypeSchema>)?.type}:${validateHelper.ajvErrorText(validate.errors)}`)
    try { makeAjv().compile(schema.fields) } catch (error) { throw new SchemaInvalid(`assignee:${schema.type}:fields:${messageOf(error)}`) }
  }

  const assertFlowSchema = (flow: StatusFlowSchema): void => {
    const validate = checkers().flow
    if (!validate(flow)) {
      throw new SchemaInvalid(`flow:${(flow as Partial<StatusFlowSchema>)?.id ?? ''}:${validateHelper.ajvErrorText(validate.errors)}`)
    }
    const keys = new Set<string>()
    for (const status of flow.statuses) {
      if (keys.has(status.key)) {
        throw new SchemaInvalid(`flow:${flow.id}:status-repeated:${status.key}`)
      }
      keys.add(status.key)
    }
    for (const rule of flow.transitions) {
      if (!keys.has(rule.to)) {
        throw new SchemaInvalid(`flow:${flow.id}:${rule.name}:to:${rule.to}`)
      }
      if (typeof rule.from === 'string') {
        if (rule.from !== '*') {
          throw new SchemaInvalid(`flow:${flow.id}:${rule.name}:from:${rule.from}`)
        }
        continue
      }
      const unknown = rule.from.find(status => !keys.has(status))
      if (unknown != null) {
        throw new SchemaInvalid(`flow:${flow.id}:${rule.name}:from:${unknown}`)
      }
    }
  }

  const assertTypeSchema = (
    type: WorkcardTypeSchema, flows: Pick<PlanningSchemaRegistry, 'flow'>
  ): void => {
    const validate = checkers().type
    if (!validate(type)) {
      throw new SchemaInvalid(`type:${(type as Partial<WorkcardTypeSchema>)?.type ?? ''}:${validateHelper.ajvErrorText(validate.errors)}`)
    }
    if (type.kind !== WorkcardKind.Card) {
      throw new SchemaInvalid(`type:${type.type}:kind:${type.kind}`)
    }
    try {
      makeAjv().compile(type.fields)
    } catch (error) {
      throw new SchemaInvalid(`type:${type.type}:fields:${messageOf(error)}`)
    }
    const seen = new Set<string>()
    for (const id of type.flows) {
      if (seen.has(id)) {
        throw new SchemaInvalid(`type:${type.type}:flow-repeated:${id}`)
      }
      seen.add(id)
      try {
        flows.flow(id)
      } catch {
        throw new SchemaInvalid(`type:${type.type}:flow:${id}`)
      }
    }
  }

  const resolveKind = <T extends WorkcardTypeSchema | StatusFlowSchema | AssigneeTypeSchema | AnyTypeSchema>(
    kind: PlanningSchemaKind,
    code: readonly T[],
    keyOf: (definition: T) => string,
    open: (definition: T) => boolean,
    valid: (definition: T) => boolean,
    layers: { entity: readonly ScopedSchemaRecord[], project: readonly ScopedSchemaRecord[] },
  ): Resolved<T> => {
    const coded = new Map(code.map(definition => [keyOf(definition), definition]))
    const byKey = (records: readonly ScopedSchemaRecord[]) => new Map(records
      .filter(record => record.kind === kind)
      .map(record => [record.key, record] as const)
      .filter(([key, record]) => {
        const definition = record.definition as T
        return valid(definition) && keyOf(definition) === key
      }))
    const entity = byKey(layers.entity)
    const project = byKey(layers.project)
    const added = [...new Set([...entity.keys(), ...project.keys()])].filter(key => !coded.has(key)).sort()

    const stamped = (record: ScopedSchemaRecord): T => ({ ...(record.definition as T), version: record.version })
    const result: Resolved<T> = { definitions: [], origins: {}, retired: [] }
    for (const key of [...coded.keys(), ...added]) {
      const declared = coded.get(key)
      const candidates: Candidate<T>[] = []
      if (declared == null || open(declared)) {
        const own = project.get(key)
        if (own != null) {
          candidates.push({ origin: SchemaOrigin.Project, definition: stamped(own), retired: own.retired === true })
        }
        const shared = entity.get(key)
        if (shared != null) {
          candidates.push({ origin: SchemaOrigin.Entity, definition: stamped(shared), retired: shared.retired === true })
        }
      }
      if (declared != null) {
        candidates.push({ origin: SchemaOrigin.Code, definition: declared, retired: false })
      }
      // A retired record gives way to a live declaration below it; only when every layer holding the
      // key retired it does the key resolve retired — still there for the cards that use it.
      const chosen = candidates.find(candidate => !candidate.retired) ?? candidates[0]
      if (chosen == null) {
        continue
      }
      result.definitions.push(chosen.definition)
      result.origins[key] = chosen.origin
      if (chosen.retired) {
        result.retired.push(key)
      }
    }

    return result
  }

  const resolveScopedBundle = (
    code: PlanningSchemaBundle, records: readonly ScopedSchemaRecord[], scope: SchemaScope & { revision?: number }
  ): ScopedSchemaBundle => {
    const mine = records.filter(record => record.entityId === scope.entityId)
    const layers = {
      entity: mine.filter(record => record.project == null),
      project: scope.project == null ? [] : mine.filter(record => record.project === scope.project),
    }
    const types = resolveKind<AnyTypeSchema>(
      PlanningSchemaKind.Type, code.types, type => type.type, openType,
      type => type != null && typeof type.type === 'string' && type.kind === WorkcardKind.Card, layers,
    )
    const flows = resolveKind<StatusFlowSchema>(
      PlanningSchemaKind.Flow, code.flows, flow => flow.id, flow => flow.overridable === true,
      flow => flow != null && typeof flow.id === 'string', layers,
    )

    const assignees = resolveKind<AssigneeTypeSchema>(
      PlanningSchemaKind.AssigneeType, code.assigneeTypes ?? [], schema => schema.type, schema => schema.overridable === true,
      schema => schema != null && typeof schema.type === 'string', { entity: layers.entity, project: [] },
    )
    return structuredClone({
      assigneeTypes: assignees.definitions,
      version: code.version,
      types: types.definitions,
      flows: flows.definitions,
      scope: scope.project == null ? { entityId: scope.entityId } : { entityId: scope.entityId, project: scope.project },
      revision: scope.revision ?? 0,
      origins: { types: types.origins, flows: flows.origins, assigneeTypes: assignees.origins },
      retired: { types: types.retired, flows: flows.retired, ...(assignees.retired.length > 0 ? { assigneeTypes: assignees.retired } : {}) },
    })
  }

  const scopedRegistryOf = (bundle: ScopedSchemaBundle): ScopedSchemaRegistry => {
    const base = makeSchemaRegistry(bundle)
    const kept = structuredClone(bundle)
    const refuse = (): never => {
      throw new PlanningUnsupported('schemas:read-only')
    }
    const originsOf = (kind: PlanningSchemaKind) =>
      kind === PlanningSchemaKind.AssigneeType ? kept.origins?.assigneeTypes : kind === PlanningSchemaKind.Type ? kept.origins?.types : kept.origins?.flows
    const retiredOf = (kind: PlanningSchemaKind) =>
      kind === PlanningSchemaKind.AssigneeType ? kept.retired?.assigneeTypes : kind === PlanningSchemaKind.Type ? kept.retired?.types : kept.retired?.flows

    return {
      ...base,
      registerAssigneeType: refuse,
      registerType: refuse,
      registerFlow: refuse,
      load: refuse,
      scope: kept.scope ?? { entityId: '' },
      revision: kept.revision ?? 0,
      originOf: (kind, key) => originsOf(kind)?.[key]
        ?? ((kind === PlanningSchemaKind.AssigneeType ? base.assigneeTypes().some(schema => schema.type === key) : kind === PlanningSchemaKind.Type ? base.has(key) : base.flows().some(flow => flow.id === key))
          ? SchemaOrigin.Code
          : undefined),
      isRetired: (kind, key) => retiredOf(kind)?.includes(key) === true,
      bundle: () => structuredClone(kept),
    }
  }

  const flowInUse = (bundle: ScopedSchemaBundle, flow: string): string | undefined => {
    if (bundle.retired?.flows.includes(flow) !== true) {
      return undefined
    }

    return bundle.types.find(type => bundle.retired?.types.includes(type.type) !== true && type.flows.includes(flow))?.type
  }

  return {
    schemaRecordKey, schemaKeyOf, assertOverridable, assertAssigneeTypeSchema, assertFlowSchema, assertTypeSchema, resolveScopedBundle,
    scopedRegistryOf, flowInUse,
  }
}

export const scopedSchemaHelper = createScopedSchemaHelper()

/** @deprecated compat:factory-refactor — use `scopedSchemaHelper.schemaRecordKey(…)` */
export const schemaRecordKey = (record: Pick<ScopedSchemaRecord, 'entityId' | 'project' | 'kind' | 'key'>): string =>
  scopedSchemaHelper.schemaRecordKey(record)

/** @deprecated compat:factory-refactor — use `scopedSchemaHelper.schemaKeyOf(…)` */
export const schemaKeyOf = (kind: PlanningSchemaKind, definition: WorkcardTypeSchema | StatusFlowSchema | AssigneeTypeSchema): string =>
  scopedSchemaHelper.schemaKeyOf(kind, definition)

/** @deprecated compat:factory-refactor — use `scopedSchemaHelper.assertOverridable(…)` */
export const assertOverridable = (
  code: Pick<PlanningSchemaRegistry, 'has' | 'type' | 'flows' | 'assigneeTypes'>, kind: PlanningSchemaKind, key: string
): void => scopedSchemaHelper.assertOverridable(code, kind, key)

/** @deprecated compat:factory-refactor — use `scopedSchemaHelper.assertFlowSchema(…)` */
export const assertFlowSchema = (flow: StatusFlowSchema): void => scopedSchemaHelper.assertFlowSchema(flow)

/** @deprecated compat:factory-refactor — use `scopedSchemaHelper.assertTypeSchema(…)` */
export const assertTypeSchema = (type: WorkcardTypeSchema, flows: Pick<PlanningSchemaRegistry, 'flow'>): void =>
  scopedSchemaHelper.assertTypeSchema(type, flows)

/** @deprecated compat:factory-refactor — use `scopedSchemaHelper.resolveScopedBundle(…)` */
export const resolveScopedBundle = (
  code: PlanningSchemaBundle, records: readonly ScopedSchemaRecord[], scope: SchemaScope & { revision?: number }
): ScopedSchemaBundle => scopedSchemaHelper.resolveScopedBundle(code, records, scope)

/** @deprecated compat:factory-refactor — use `scopedSchemaHelper.scopedRegistryOf(…)` */
export const scopedRegistryOf = (bundle: ScopedSchemaBundle): ScopedSchemaRegistry => scopedSchemaHelper.scopedRegistryOf(bundle)

/** @deprecated compat:factory-refactor — use `scopedSchemaHelper.flowInUse(…)` */
export const flowInUse = (bundle: ScopedSchemaBundle, flow: string): string | undefined => scopedSchemaHelper.flowInUse(bundle, flow)
