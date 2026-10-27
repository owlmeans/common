import type { AssigneeTypeSchema } from './resources/types.js'
import type { ValidateFunction } from 'ajv'
import { PLANNING_SCHEMA_VERSION } from './consts.js'
import { UnknownStatusFlow, UnknownWorkcardType } from './errors.js'
import { appSchemaHelper } from './helpers/app.js'
import { makeAjv } from './helpers/validate.js'
import type { AnyTypeSchema, PlanningAppDeclarations, PlanningSchemaBundle, PlanningSchemaRegistry, StatusFlowSchema } from './types.js'

/**
 * Types, flows, the application's declarations and the compiled validator of each type's `fields`
 * (its own schema, with the application's base card fields for a `card` type).
 *
 * It lives in the contract package so a client answers `can()` / `available()` from a loaded bundle
 * with no round trip. A later registration of the same type or flow id replaces the earlier one;
 * `registerApp` replaces the declarations; `load(bundle)` replaces everything.
 */
export const makeSchemaRegistry = (bundle?: Partial<PlanningSchemaBundle>): PlanningSchemaRegistry => {
  const types = new Map<string, AnyTypeSchema>()
  const assigneeTypes = new Map<string, AssigneeTypeSchema>()
  const assigneeValidators = new Map<string, ValidateFunction>()
  const flows = new Map<string, StatusFlowSchema>()
  const validators = new Map<string, ValidateFunction>()
  let app: PlanningAppDeclarations | undefined
  let ajv = makeAjv()

  const registry: PlanningSchemaRegistry = {
    registerAssigneeType: schema => {
      assigneeTypes.set(schema.type, schema)
      assigneeValidators.delete(schema.type)
    },
    assigneeTypes: () => [...assigneeTypes.values()],
    assigneeType: type => {
      const schema = assigneeTypes.get(type)
      if (schema == null) throw new UnknownWorkcardType(`assignee:${type}`)
      return schema
    },
    assigneeValidator: type => {
      let validator = assigneeValidators.get(type)
      if (validator == null) {
        validator = ajv.compile(registry.assigneeType(type).fields)
        assigneeValidators.set(type, validator)
      }
      return validator
    },
    registerType: schema => {
      types.set(schema.type, schema)
      validators.delete(schema.type)
    },

    registerFlow: flow => {
      flows.set(flow.id, flow)
    },

    registerApp: next => {
      if (next != null) {
        appSchemaHelper.assertDeclarations(next)
      }
      if (next == null && app == null) {
        return
      }
      app = next == null ? undefined : structuredClone(next)
      validators.clear()
      assigneeValidators.clear()
      // A fresh ajv: a replaced declaration must not collide with a schema `$id` the old one compiled.
      ajv = makeAjv()
    },

    app: () => app,

    types: () => [...types.values()],

    type: type => {
      const schema = types.get(type)
      if (schema == null) {
        throw new UnknownWorkcardType(type)
      }
      return schema
    },

    has: type => types.has(type),

    flows: () => [...flows.values()],

    flow: id => {
      const flow = flows.get(id)
      if (flow == null) {
        throw new UnknownStatusFlow(id)
      }
      return flow
    },

    primaryFlow: type => {
      const primary = registry.type(type).flows[0]
      if (primary == null) {
        throw new UnknownStatusFlow(`${type}:primary`)
      }
      return registry.flow(primary)
    },

    fieldsSchema: type => appSchemaHelper.fieldsSchemaOf(registry.type(type), app),

    validator: type => {
      let validate = validators.get(type)
      if (validate == null) {
        validate = ajv.compile(registry.fieldsSchema(type))
        validators.set(type, validate)
      }
      return validate
    },

    bundle: () => structuredClone({
      version: PLANNING_SCHEMA_VERSION,
      types: [...types.values()],
      flows: [...flows.values()],
      assigneeTypes: [...assigneeTypes.values()],
      ...(app != null ? { app } : {}),
    }),

    load: next => {
      assigneeTypes.clear()
      assigneeValidators.clear()
      types.clear()
      flows.clear()
      validators.clear()
      app = undefined
      // A fresh ajv: a replaced type must not collide with a schema `$id` the old one compiled.
      ajv = makeAjv()
      registry.registerApp(next.app ?? undefined)
      next.assigneeTypes?.forEach(registry.registerAssigneeType)
      next.flows.forEach(registry.registerFlow)
      next.types.forEach(registry.registerType)
    },
  }

  registry.registerApp(bundle?.app ?? undefined)
  bundle?.assigneeTypes?.forEach(registry.registerAssigneeType)
  bundle?.flows?.forEach(registry.registerFlow)
  bundle?.types?.forEach(registry.registerType)

  return registry
}
