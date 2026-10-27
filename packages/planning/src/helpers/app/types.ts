import type { AnySchema } from 'ajv'
import type { PlanningSchemaKind } from '../../consts.js'
import type { AnyTypeSchema, PlanningAppDeclarations } from '../../types.js'

/** The declarations whose properties a definition carries in its `app` bag. */
export type PlanningAppBagKind = PlanningSchemaKind.Type | PlanningSchemaKind.Flow

/**
 * The application's pregenerated planning properties: the `app` bag of every type and flow
 * declaration, and the base `fields` of every card — declared in code, beside the custom fields a
 * data-defined type gives its cards.
 */
export interface AppSchemaHelper {
  /**
   * Merge declarations in the order given — a planning service passes its own `schemas.app` first,
   * then every plugin's in plugin order (`order` ascending, registration order among equals). Per
   * kind (`type`, `flow`, `card`): `properties` are united, a later declaration of a name replacing
   * the earlier one whole; `required` is the union. `undefined` when no source declares anything.
   *
   * @throws {SchemaInvalid} a malformed source
   */
  merge: (sources: ReadonlyArray<PlanningAppDeclarations | undefined>) => PlanningAppDeclarations | undefined
  /**
   * The closed form of declarations: per kind only `type` (`'object'`), `properties` (names without
   * `.` or `$`) and `required` (each name declared), and — outside a browser document — a schema that
   * compiles. A page never compiles: a strict `script-src` refuses code generation, and what a page
   * registers its server compiled when it registered it.
   *
   * @throws {SchemaInvalid} `app:<kind>:…`
   */
  assertDeclarations: (app: PlanningAppDeclarations) => void
  /**
   * The schema a definition's `app` bag must match: the declared kind closed over its properties
   * (`additionalProperties: false`). `undefined` when the kind is not declared.
   */
  bagSchemaOf: (app: PlanningAppDeclarations | undefined, kind: PlanningAppBagKind) => AnySchema | undefined
  /**
   * Check a declaration's `app` bag: refused when the kind is undeclared and the bag is present;
   * matched against {@link bagSchemaOf} otherwise (an absent bag is `{}`, so a required property
   * makes the bag mandatory).
   *
   * @throws {SchemaInvalid} `<kind>:<key>:app:…`
   */
  assertBag: (kind: PlanningAppBagKind, key: string, bag: unknown, app?: PlanningAppDeclarations) => void
  /**
   * The schema a type's `fields` validate against. Without base card fields, or for a project or
   * specification type, it is the type's own `fields` object itself. Otherwise the type's schema
   * stays the root (so its `#/…` references still resolve) and gains: each base name in its
   * top-level `properties` as `{}` when it does not declare it (its `additionalProperties` never
   * refuses a base field; its own declaration of the name still applies and may narrow it), and the
   * base object schema appended to its `allOf`.
   */
  fieldsSchemaOf: (type: AnyTypeSchema, app?: PlanningAppDeclarations) => AnySchema
}
