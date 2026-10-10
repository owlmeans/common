import type { AssigneeTypeSchema } from '../../resources/types.js'
import type { PlanningSchemaKind } from '../../consts.js'
import type {
  PlanningSchemaBundle, PlanningSchemaRegistry, SchemaScope, ScopedSchemaBundle, ScopedSchemaRecord,
  ScopedSchemaRegistry, StatusFlowSchema, WorkcardTypeSchema,
} from '../../types.js'

/** Data-defined (scoped) types and flows: their keys, the checks a write passes, and the layer they resolve to. */
export interface ScopedSchemaHelper {
  /** One layer's identity of a record: organization, project (or none), kind, key. */
  schemaRecordKey: (record: Pick<ScopedSchemaRecord, 'entityId' | 'project' | 'kind' | 'key'>) => string
  /** The key a declaration is addressed by: a type's `type`, a flow's `id`. */
  schemaKeyOf: (kind: PlanningSchemaKind, definition: WorkcardTypeSchema | StatusFlowSchema | AssigneeTypeSchema) => string
  /**
   * Refuse a data-defined declaration of a key the code registry seals: a code type or flow that does
   * not say `overridable: true`, and any project or specification type.
   *
   * @throws {SchemaSealed}
   */
  assertOverridable: (
    code: Pick<PlanningSchemaRegistry, 'has' | 'type' | 'flows' | 'assigneeTypes'>, kind: PlanningSchemaKind, key: string
  ) => void
  /**
   * The closed-form checks of a data-defined flow: the declaration's own schema, at least one status,
   * unique status keys, every rule's `to` declared, and a `from` that is `'*'` or a list of declared
   * statuses.
   *
   * @throws {SchemaInvalid}
   */
  assertAssigneeTypeSchema: (schema: AssigneeTypeSchema) => void
  assertFlowSchema: (flow: StatusFlowSchema) => void
  /**
   * The closed-form checks of a data-defined type: the declaration's own schema, the `card` kind,
   * a `fields` schema that compiles, and unique flow ids every one of which resolves.
   *
   * @throws {SchemaInvalid}
   */
  assertTypeSchema: (type: WorkcardTypeSchema, flows: Pick<PlanningSchemaRegistry, 'flow'>) => void
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
  resolveScopedBundle: (
    code: PlanningSchemaBundle, records: readonly ScopedSchemaRecord[], scope: SchemaScope & { revision?: number }
  ) => ScopedSchemaBundle
  /**
   * A read-only registry over a resolved layer. It answers exactly what `makeSchemaRegistry` answers
   * for the same types and flows, plus where each key came from and whether it is retired; its
   * `registerType`, `registerFlow` and `load` refuse with `PlanningUnsupported`.
   */
  scopedRegistryOf: (bundle: ScopedSchemaBundle) => ScopedSchemaRegistry
  /**
   * The live type that keeps a flow from being retired in a resolved layer: the flow resolves retired
   * (no live declaration below the retired record) while a type that is not retired still runs it.
   */
  flowInUse: (bundle: ScopedSchemaBundle, flow: string) => string | undefined
}
