import type { ValidateFunction } from 'ajv'
import { PlanningSchemaKind, SchemaOrigin, WorkcardKind } from '../consts.js'
import { PlanningUnsupported, SchemaInvalid, SchemaSealed } from '../errors.js'
import { makeSchemaRegistry } from '../registry.js'
import { StatusFlowSchemaSchema, WorkcardTypeSchemaSchema } from '../schemas.js'
import type {
  AnyTypeSchema, PlanningSchemaBundle, PlanningSchemaRegistry, SchemaScope, ScopedSchemaBundle,
  ScopedSchemaRecord, ScopedSchemaRegistry, StatusFlowSchema, WorkcardTypeSchema,
} from '../types.js'
import { ajvErrorText, makeAjv } from './validate.js'

let checker: { flow: ValidateFunction, type: ValidateFunction } | undefined
const checkers = () => checker ??= (() => {
  const ajv = makeAjv()
  return { flow: ajv.compile(StatusFlowSchemaSchema), type: ajv.compile(WorkcardTypeSchemaSchema) }
})()

const messageOf = (error: unknown): string => error instanceof Error ? error.message : `${error}`

/** One layer's identity of a record: organization, project (or none), kind, key. */
export const schemaRecordKey = (record: Pick<ScopedSchemaRecord, 'entityId' | 'project' | 'kind' | 'key'>): string =>
  `${record.entityId}\u0000${record.project ?? ''}\u0000${record.kind}\u0000${record.key}`

/** The key a declaration is addressed by: a type's `type`, a flow's `id`. */
export const schemaKeyOf = (kind: PlanningSchemaKind, definition: WorkcardTypeSchema | StatusFlowSchema): string =>
  kind === PlanningSchemaKind.Type ? (definition as WorkcardTypeSchema).type : (definition as StatusFlowSchema).id

const openType = (type: AnyTypeSchema): boolean => type.kind === WorkcardKind.Card && type.overridable === true

/**
 * Refuse a data-defined declaration of a key the code registry seals: a code type or flow that does
 * not say `overridable: true`, and any project or specification type.
 *
 * @throws {SchemaSealed}
 */
export const assertOverridable = (
  code: Pick<PlanningSchemaRegistry, 'has' | 'type' | 'flows'>, kind: PlanningSchemaKind, key: string
): void => {
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

/**
 * The closed-form checks of a data-defined flow: the declaration's own schema, at least one status,
 * unique status keys, every rule's `to` declared, and a `from` that is `'*'` or a list of declared
 * statuses.
 *
 * @throws {SchemaInvalid}
 */
export const assertFlowSchema = (flow: StatusFlowSchema): void => {
  const validate = checkers().flow
  if (!validate(flow)) {
    throw new SchemaInvalid(`flow:${(flow as Partial<StatusFlowSchema>)?.id ?? ''}:${ajvErrorText(validate.errors)}`)
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

/**
 * The closed-form checks of a data-defined type: the declaration's own schema, the `card` kind,
 * a `fields` schema that compiles, and unique flow ids every one of which resolves.
 *
 * @throws {SchemaInvalid}
 */
export const assertTypeSchema = (
  type: WorkcardTypeSchema, flows: Pick<PlanningSchemaRegistry, 'flow'>
): void => {
  const validate = checkers().type
  if (!validate(type)) {
    throw new SchemaInvalid(`type:${(type as Partial<WorkcardTypeSchema>)?.type ?? ''}:${ajvErrorText(validate.errors)}`)
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

interface Candidate<T> {
  origin: SchemaOrigin
  definition: T
  retired: boolean
}

interface Resolved<T> {
  definitions: T[]
  origins: Record<string, SchemaOrigin>
  retired: string[]
}

const resolveKind = <T extends WorkcardTypeSchema | StatusFlowSchema | AnyTypeSchema>(
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

/**
 * One layer resolved: the code bundle, overlaid by the organization-wide records, then by the
 * project's (when `scope.project` names one). Pure — every store and both sides of the wire resolve
 * the same records to the same bundle.
 *
 * - A code key is sealed unless it says `overridable: true`; project and specification types are
 *   always sealed, so only card types and flows are data-defined. A record under a sealed key is
 *   ignored here (the write path refuses it with `SchemaSealed`).
 * - A project record overrides an organization-wide one of the same key.
 * - A retired record gives way to the nearest live declaration below it; a key retired in every
 *   layer resolves retired — present in `types`/`flows`, listed in `retired`.
 * - A data-defined declaration carries its record's `version`.
 */
export const resolveScopedBundle = (
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

  return structuredClone({
    version: code.version,
    types: types.definitions,
    flows: flows.definitions,
    scope: scope.project == null ? { entityId: scope.entityId } : { entityId: scope.entityId, project: scope.project },
    revision: scope.revision ?? 0,
    origins: { types: types.origins, flows: flows.origins },
    retired: { types: types.retired, flows: flows.retired },
  })
}

/**
 * A read-only registry over a resolved layer. It answers exactly what `makeSchemaRegistry` answers
 * for the same types and flows, plus where each key came from and whether it is retired; its
 * `registerType`, `registerFlow` and `load` refuse with `PlanningUnsupported`.
 */
export const scopedRegistryOf = (bundle: ScopedSchemaBundle): ScopedSchemaRegistry => {
  const base = makeSchemaRegistry(bundle)
  const kept = structuredClone(bundle)
  const refuse = (): never => {
    throw new PlanningUnsupported('schemas:read-only')
  }
  const originsOf = (kind: PlanningSchemaKind) =>
    kind === PlanningSchemaKind.Type ? kept.origins?.types : kept.origins?.flows
  const retiredOf = (kind: PlanningSchemaKind) =>
    kind === PlanningSchemaKind.Type ? kept.retired?.types : kept.retired?.flows

  return {
    ...base,
    registerType: refuse,
    registerFlow: refuse,
    load: refuse,
    scope: kept.scope ?? { entityId: '' },
    revision: kept.revision ?? 0,
    originOf: (kind, key) => originsOf(kind)?.[key]
      ?? ((kind === PlanningSchemaKind.Type ? base.has(key) : base.flows().some(flow => flow.id === key))
        ? SchemaOrigin.Code
        : undefined),
    isRetired: (kind, key) => retiredOf(kind)?.includes(key) === true,
    bundle: () => structuredClone(kept),
  }
}

/**
 * The live type that keeps a flow from being retired in a resolved layer: the flow resolves retired
 * (no live declaration below the retired record) while a type that is not retired still runs it.
 */
export const flowInUse = (bundle: ScopedSchemaBundle, flow: string): string | undefined => {
  if (bundle.retired?.flows.includes(flow) !== true) {
    return undefined
  }

  return bundle.types.find(type => bundle.retired?.types.includes(type.type) !== true && type.flows.includes(flow))?.type
}
