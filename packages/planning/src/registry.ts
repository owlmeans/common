import type { ValidateFunction } from 'ajv'
import { PLANNING_SCHEMA_VERSION } from './consts.js'
import { UnknownStatusFlow, UnknownWorkcardType } from './errors.js'
import { makeAjv } from './helpers/validate.js'
import type { AnyTypeSchema, PlanningSchemaBundle, PlanningSchemaRegistry, StatusFlowSchema } from './types.js'

/**
 * Types, flows and the compiled validator of each type's `fields`.
 *
 * It lives in the contract package so a client answers `can()` / `available()` from a loaded bundle
 * with no round trip. A later registration of the same type or flow id replaces the earlier one;
 * `load(bundle)` replaces everything.
 */
export const makeSchemaRegistry = (bundle?: Partial<PlanningSchemaBundle>): PlanningSchemaRegistry => {
  const types = new Map<string, AnyTypeSchema>()
  const flows = new Map<string, StatusFlowSchema>()
  const validators = new Map<string, ValidateFunction>()
  let ajv = makeAjv()

  const registry: PlanningSchemaRegistry = {
    registerType: schema => {
      types.set(schema.type, schema)
      validators.delete(schema.type)
    },

    registerFlow: flow => {
      flows.set(flow.id, flow)
    },

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

    validator: type => {
      let validate = validators.get(type)
      if (validate == null) {
        validate = ajv.compile(registry.type(type).fields)
        validators.set(type, validate)
      }
      return validate
    },

    bundle: () => structuredClone({
      version: PLANNING_SCHEMA_VERSION,
      types: [...types.values()],
      flows: [...flows.values()],
    }),

    load: next => {
      types.clear()
      flows.clear()
      validators.clear()
      // A fresh ajv: a replaced type must not collide with a schema `$id` the old one compiled.
      ajv = makeAjv()
      next.flows.forEach(registry.registerFlow)
      next.types.forEach(registry.registerType)
    },
  }

  bundle?.flows?.forEach(registry.registerFlow)
  bundle?.types?.forEach(registry.registerType)

  return registry
}
