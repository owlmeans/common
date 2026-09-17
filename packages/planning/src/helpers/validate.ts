import { Ajv } from 'ajv'
import type { ErrorObject, ValidateFunction } from 'ajv'
import formatsPlugin from 'ajv-formats'
import { SpecificationFormat, WorkcardKind } from '../consts.js'
import { FieldsInvalid, PlanningError } from '../errors.js'
import { AnyWorkcardSchema, SpecificationSchema, WorkcardSchema } from '../schemas.js'
import type { PlanningSchemaRegistry, SpecificationSlot, Workcard } from '../types.js'

/** The ajv every planning validation compiles with: lenient about unknown keywords, all errors, formats. */
export const makeAjv = (): Ajv => {
  const ajv = new Ajv({ strict: false, allErrors: true })
  formatsPlugin(ajv as any)

  return ajv
}

let shared: Ajv | undefined
const ajvOf = (): Ajv => shared ??= makeAjv()

const compiled = new Map<object, ValidateFunction>()
const compile = (schema: object): ValidateFunction => {
  let validate = compiled.get(schema)
  if (validate == null) {
    validate = ajvOf().compile(schema)
    compiled.set(schema, validate)
  }

  return validate
}

/** One line per ajv error: `/path message`. */
export const ajvErrorText = (errors?: ErrorObject[] | null): string =>
  (errors ?? []).map(error => `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? 'invalid'}`)
    .join('; ')

/** Keys holding `.` or `$` at any depth — a document store cannot hold them. */
export const invalidFieldKeys = (fields: unknown, path: string = ''): string[] => {
  if (fields == null || typeof fields !== 'object') {
    return []
  }
  if (Array.isArray(fields)) {
    return fields.flatMap((entry, index) => invalidFieldKeys(entry, `${path}${index}.`))
  }

  return Object.entries(fields).flatMap(([key, value]) => [
    ...(key.includes('.') || key.includes('$') ? [`${path}${key}`] : []),
    ...invalidFieldKeys(value, `${path}${key}.`),
  ])
}

/**
 * Check `fields` against the type's schema, and its keys against the store rule.
 *
 * @throws {FieldsInvalid}
 */
export const validateFields = (
  registry: Pick<PlanningSchemaRegistry, 'validator'>, type: string, fields: Record<string, unknown>
): void => {
  const keys = invalidFieldKeys(fields)
  if (keys.length > 0) {
    throw new FieldsInvalid(`keys:${keys.join(',')}`)
  }
  const validate = registry.validator(type)
  if (!validate(fields)) {
    throw new FieldsInvalid(`${type}:${ajvErrorText(validate.errors)}`)
  }
}

/**
 * Check a whole record: its shape by kind, then its `fields` by type.
 *
 * @throws {PlanningError} `malformed:card:…` for a shape fault
 * @throws {FieldsInvalid}
 */
export const validateCard = (card: Workcard, registry: Pick<PlanningSchemaRegistry, 'validator'>): void => {
  const validate = compile(card.kind === WorkcardKind.Specification
    ? SpecificationSchema
    : card.kind === WorkcardKind.Card || card.kind === WorkcardKind.Project ? WorkcardSchema : AnyWorkcardSchema)
  if (!validate(card)) {
    throw new PlanningError(`malformed:card:${ajvErrorText(validate.errors)}`)
  }
  validateFields(registry, card.type, card.fields)
}

/**
 * Check a document body against its slot: a JSON slot must parse, and match the slot's schema when
 * it declares one.
 *
 * @throws {FieldsInvalid}
 */
export const validateSpecificationBody = (slot: SpecificationSlot, body?: string | null): void => {
  if (body == null || slot.format !== SpecificationFormat.Json) {
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new FieldsInvalid(`body:${slot.category}:not-json`)
  }
  if (slot.schema != null && typeof slot.schema === 'object') {
    const validate = compile(slot.schema)
    if (!validate(parsed)) {
      throw new FieldsInvalid(`body:${slot.category}:${ajvErrorText(validate.errors)}`)
    }
  }
}
