import type { AnySchema, ValidateFunction } from 'ajv'
import { PlanningSchemaKind, WorkcardKind } from '../consts.js'
import { SchemaInvalid } from '../errors.js'
import type { PlanningAppDeclarations, PlanningAppSchema } from '../types.js'
import type { AppSchemaHelper, PlanningAppBagKind } from './app/types.js'
import { APP_KINDS, APP_SCHEMA_KEYS } from './app/consts.local.js'
import { makeAjv, validateHelper } from './validate.js'

const messageOf = (error: unknown): string => error instanceof Error ? error.message : `${error}`

const isObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

export const createAppSchemaHelper = (): AppSchemaHelper => {
  // Keyed by the declared kind object a registry keeps — a fresh ajv per entry, so a replaced
  // declaration leaves nothing compiled behind.
  const bags = new WeakMap<PlanningAppSchema, ValidateFunction>()

  // A page never compiles: under a strict `script-src` Ajv's code generation is refused, and the
  // declarations a page registers are its server's, compiled there when they were registered.
  const compiles = (): boolean => typeof (globalThis as { document?: unknown }).document === 'undefined'

  const objectSchemaOf = (declared: PlanningAppSchema): Record<string, unknown> => ({
    type: 'object',
    properties: declared.properties,
    ...((declared.required?.length ?? 0) > 0 ? { required: [...declared.required!] } : {}),
  })

  const declaredOf = (app: PlanningAppDeclarations | undefined, kind: PlanningAppBagKind): PlanningAppSchema | undefined =>
    kind === PlanningSchemaKind.Type ? app?.type : app?.flow

  const assertDeclarations: AppSchemaHelper['assertDeclarations'] = app => {
    if (!isObject(app)) {
      throw new SchemaInvalid('app:declarations')
    }
    const kinds: readonly string[] = APP_KINDS
    const stranger = Object.keys(app).find(key => !kinds.includes(key))
    if (stranger != null) {
      throw new SchemaInvalid(`app:kind:${stranger}`)
    }
    for (const kind of APP_KINDS) {
      const declared: unknown = app[kind]
      if (declared == null) {
        continue
      }
      if (!isObject(declared)) {
        throw new SchemaInvalid(`app:${kind}:schema`)
      }
      const keyword = Object.keys(declared).find(key => !APP_SCHEMA_KEYS.has(key))
      if (keyword != null) {
        throw new SchemaInvalid(`app:${kind}:keyword:${keyword}`)
      }
      if (declared.type != null && declared.type !== 'object') {
        throw new SchemaInvalid(`app:${kind}:type`)
      }
      if (!isObject(declared.properties)) {
        throw new SchemaInvalid(`app:${kind}:properties`)
      }
      const names = Object.keys(declared.properties)
      const badName = names.find(name => name === '' || name.includes('.') || name.includes('$'))
      if (badName != null) {
        throw new SchemaInvalid(`app:${kind}:name:${badName}`)
      }
      const required: unknown = declared.required
      if (required != null && (!Array.isArray(required) || required.some(name => typeof name !== 'string'))) {
        throw new SchemaInvalid(`app:${kind}:required`)
      }
      const missing = (required as string[] | undefined)?.find(name => !names.includes(name))
      if (missing != null) {
        throw new SchemaInvalid(`app:${kind}:required:${missing}`)
      }
      if (compiles()) {
        try {
          makeAjv().compile(objectSchemaOf(declared as unknown as PlanningAppSchema))
        } catch (error) {
          throw new SchemaInvalid(`app:${kind}:${messageOf(error)}`)
        }
      }
    }
  }

  const merge: AppSchemaHelper['merge'] = sources => {
    const merged: PlanningAppDeclarations = {}
    for (const source of sources) {
      if (source == null) {
        continue
      }
      assertDeclarations(source)
      for (const kind of APP_KINDS) {
        const next = source[kind]
        if (next == null) {
          continue
        }
        const current = merged[kind]
        const required = [...new Set([...(current?.required ?? []), ...(next.required ?? [])])]
        merged[kind] = {
          type: 'object',
          properties: { ...current?.properties, ...structuredClone(next.properties) },
          ...(required.length > 0 ? { required } : {}),
        }
      }
    }

    return Object.keys(merged).length > 0 ? merged : undefined
  }

  const bagSchemaOf: AppSchemaHelper['bagSchemaOf'] = (app, kind) => {
    const declared = declaredOf(app, kind)

    return declared == null ? undefined : { ...objectSchemaOf(declared), additionalProperties: false }
  }

  const assertBag: AppSchemaHelper['assertBag'] = (kind, key, bag, app) => {
    const declared = declaredOf(app, kind)
    if (declared == null) {
      if (bag != null) {
        throw new SchemaInvalid(`${kind}:${key}:app:undeclared`)
      }
      return
    }
    const keys = validateHelper.invalidFieldKeys(bag)
    if (keys.length > 0) {
      throw new SchemaInvalid(`${kind}:${key}:app:keys:${keys.join(',')}`)
    }
    let validate = bags.get(declared)
    if (validate == null) {
      validate = makeAjv().compile(bagSchemaOf(app, kind) as object)
      bags.set(declared, validate)
    }
    if (!validate(bag ?? {})) {
      throw new SchemaInvalid(`${kind}:${key}:app:${validateHelper.ajvErrorText(validate.errors)}`)
    }
  }

  const fieldsSchemaOf: AppSchemaHelper['fieldsSchemaOf'] = (type, app) => {
    const base = app?.card
    const own: AnySchema = type.fields
    if (base == null || type.kind !== WorkcardKind.Card) {
      return own
    }
    const declared = objectSchemaOf(base)
    if (!isObject(own)) {
      return own === false ? false : declared
    }
    // The type's schema stays the root, so its own `#/…` references keep resolving.
    const admitted = Object.fromEntries(Object.keys(base.properties).map(name => [name, {}]))

    return {
      ...own,
      properties: { ...admitted, ...(isObject(own.properties) ? own.properties : {}) },
      allOf: [...(Array.isArray(own.allOf) ? own.allOf : []), declared],
    }
  }

  return { merge, assertDeclarations, bagSchemaOf, assertBag, fieldsSchemaOf }
}

export const appSchemaHelper = createAppSchemaHelper()
