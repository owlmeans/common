import type { ErrorObject } from 'ajv'
import type { PlanningSchemaRegistry, SpecificationSlot, Workcard } from '../../types.js'

/** A record's shape, its type's `fields` and a document's body, checked against their schemas. */
export interface ValidateHelper {
  /** One line per ajv error: `/path message`. */
  ajvErrorText: (errors?: ErrorObject[] | null) => string
  /** Keys holding `.` or `$` at any depth — a document store cannot hold them. */
  invalidFieldKeys: (fields: unknown, path?: string) => string[]
  /**
   * Check `fields` against the type's schema, and its keys against the store rule.
   *
   * @throws {FieldsInvalid}
   */
  validateFields: (registry: Pick<PlanningSchemaRegistry, 'validator'>, type: string, fields: Record<string, unknown>) => void
  /**
   * Check a whole record: its shape by kind, then its `fields` by type.
   *
   * @throws {PlanningError} `malformed:card:…` for a shape fault
   * @throws {FieldsInvalid}
   */
  validateCard: (card: Workcard, registry: Pick<PlanningSchemaRegistry, 'validator'>) => void
  /**
   * Check a document body against its slot: a JSON slot must parse, and match the slot's schema when
   * it declares one.
   *
   * @throws {FieldsInvalid}
   */
  validateSpecificationBody: (slot: SpecificationSlot, body?: string | null) => void
}
