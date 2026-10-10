import { Ajv } from 'ajv'
import type { ErrorObject, ValidateFunction } from 'ajv'
import formatsPlugin from 'ajv-formats'
import { memoHelper } from '@owlmeans/context'
import { SpecificationFormat, WorkcardKind } from '../consts.js'
import { FieldsInvalid, PlanningError } from '../errors.js'
import { AnyWorkcardSchema, SpecificationSchema, WorkcardSchema } from '../schemas.js'
import type { PlanningSchemaRegistry, SpecificationSlot, Workcard } from '../types.js'
import type { ValidateHelper } from './validate/types.js'

/** The ajv every planning validation compiles with: lenient about unknown keywords, all errors, formats. */
export const makeAjv = (): Ajv => {
  const ajv = new Ajv({ strict: false, allErrors: true })
  formatsPlugin(ajv as any)

  return ajv
}

export const createValidateHelper = (): ValidateHelper => {
  const ajvOf = memoHelper.once(makeAjv)

  const compiled = new Map<object, ValidateFunction>()
  const compile = (schema: object): ValidateFunction => {
    let validate = compiled.get(schema)
    if (validate == null) {
      validate = ajvOf().compile(schema)
      compiled.set(schema, validate)
    }

    return validate
  }

  const ajvErrorText = (errors?: ErrorObject[] | null): string =>
    (errors ?? []).map(error => `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? 'invalid'}`)
      .join('; ')

  const invalidFieldKeys = (fields: unknown, path: string = ''): string[] => {
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

  const validateFields = (
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

  const validateCard = (card: Workcard, registry: Pick<PlanningSchemaRegistry, 'validator'>): void => {
    const validate = compile(card.kind === WorkcardKind.Specification
      ? SpecificationSchema
      : card.kind === WorkcardKind.Card || card.kind === WorkcardKind.Project ? WorkcardSchema : AnyWorkcardSchema)
    if (!validate(card)) {
      throw new PlanningError(`malformed:card:${ajvErrorText(validate.errors)}`)
    }
    validateFields(registry, card.type, card.fields)
  }

  const validateSpecificationBody = (slot: SpecificationSlot, body?: string | null): void => {
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

  const assertSchema = (schema: object, value: unknown): void => {
    const validate = compile(schema)
    if (!validate(value)) throw new FieldsInvalid(ajvErrorText(validate.errors))
  }

  return { assertSchema, ajvErrorText, invalidFieldKeys, validateFields, validateCard, validateSpecificationBody }
}

export const validateHelper = createValidateHelper()

/** @deprecated compat:factory-refactor — use `validateHelper.ajvErrorText(…)` */
export const ajvErrorText = (errors?: ErrorObject[] | null): string => validateHelper.ajvErrorText(errors)

/** @deprecated compat:factory-refactor — use `validateHelper.invalidFieldKeys(…)` */
export const invalidFieldKeys = (fields: unknown, path: string = ''): string[] => validateHelper.invalidFieldKeys(fields, path)

/** @deprecated compat:factory-refactor — use `validateHelper.validateFields(…)` */
export const validateFields = (
  registry: Pick<PlanningSchemaRegistry, 'validator'>, type: string, fields: Record<string, unknown>
): void => validateHelper.validateFields(registry, type, fields)

/** @deprecated compat:factory-refactor — use `validateHelper.validateCard(…)` */
export const validateCard = (card: Workcard, registry: Pick<PlanningSchemaRegistry, 'validator'>): void =>
  validateHelper.validateCard(card, registry)

/** @deprecated compat:factory-refactor — use `validateHelper.validateSpecificationBody(…)` */
export const validateSpecificationBody = (slot: SpecificationSlot, body?: string | null): void =>
  validateHelper.validateSpecificationBody(slot, body)
