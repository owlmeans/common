import { ANY_STATUS, INTRINSIC_ORDER, IntrinsicPolicy, IntrinsicStatus } from '../consts.js'
import { PlanningError, UnknownStatusFlow } from '../errors.js'
import type {
  AnyTypeSchema, PlanningSchemaRegistry, StatusDefinition, StatusFlowSchema, StatusTransitionRule,
} from '../types.js'

type FlowLookup = Pick<PlanningSchemaRegistry, 'flow'>

/** The primary flow id of a type — `flows[0]`. @throws {UnknownStatusFlow} when it declares none */
export const primaryFlowOf = (type: AnyTypeSchema): string => {
  const primary = type.flows[0]
  if (primary == null) {
    throw new UnknownStatusFlow(`${type.type}:primary`)
  }

  return primary
}

export const flowIdsOf = (type: AnyTypeSchema): string[] => [...type.flows]

export const statusDefinitionOf = (flow: StatusFlowSchema, status: string): StatusDefinition | undefined =>
  flow.statuses.find(definition => definition.key === status)

/** The intrinsic state a status maps onto, or `undefined` for a status the flow does not declare. */
export const intrinsicOf = (flow: StatusFlowSchema, status: string): IntrinsicStatus | undefined =>
  statusDefinitionOf(flow, status)?.intrinsic

/** The status marked `initial`, else the first one. @throws {PlanningError} for a flow with none */
export const initialStatusOf = (flow: StatusFlowSchema): string => {
  const status = flow.statuses.find(definition => definition.initial === true) ?? flow.statuses[0]
  if (status == null) {
    throw new PlanningError(`flow-empty:${flow.id}`)
  }

  return status.key
}

export const isTerminal = (flow: StatusFlowSchema, status: string): boolean =>
  statusDefinitionOf(flow, status)?.terminal === true

const fromMatches = (rule: StatusTransitionRule, status: string): boolean =>
  rule.from === ANY_STATUS || (Array.isArray(rule.from) && rule.from.includes(status))

/**
 * The rule a named transition follows from a status.
 *
 * A name may be declared several times with different `from` sets; the rule naming the status
 * explicitly wins, and a `'*'` rule of that name answers only when none does.
 */
export const ruleOf = (
  flow: StatusFlowSchema, transition: string, from: string
): StatusTransitionRule | undefined => {
  const named = flow.transitions.filter(rule => rule.name === transition)

  return named.find(rule => rule.from !== ANY_STATUS && fromMatches(rule, from))
    ?? named.find(rule => rule.from === ANY_STATUS)
}

export const canTransit = (flow: StatusFlowSchema, transition: string, from: string): boolean =>
  ruleOf(flow, transition, from) != null

/**
 * Every transition available from a status, one rule per name (the one `ruleOf` would pick), in
 * declaration order. `explicit: true` keeps only the rules offered to a person.
 */
export const transitionsFrom = (
  flow: StatusFlowSchema, status: string, opts?: { explicit?: boolean }
): StatusTransitionRule[] => {
  const names = [...new Set(flow.transitions.map(rule => rule.name))]

  return names.map(name => ruleOf(flow, name, status))
    .filter((rule): rule is StatusTransitionRule => rule != null)
    .filter(rule => opts?.explicit !== true || rule.explicit === true)
}

/**
 * A new card's status per flow: every flow's initial status, with the primary one overridden by
 * `status` when the draft names one.
 *
 * @throws {UnknownStatusFlow}
 */
export const initialFlowsOf = (
  type: AnyTypeSchema, registry: FlowLookup, status?: string
): Record<string, string> => {
  const primary = primaryFlowOf(type)

  return Object.fromEntries(type.flows.map(id => [
    id, id === primary && status != null ? status : initialStatusOf(registry.flow(id)),
  ]))
}

/**
 * The card's intrinsic state over its flows. {@link IntrinsicPolicy.Primary} reads the primary
 * flow; {@link IntrinsicPolicy.All} takes the least advanced flow. A status the flow does not
 * declare reads as planned.
 *
 * @throws {UnknownStatusFlow}
 */
export const resolveIntrinsic = (
  type: AnyTypeSchema, flows: Record<string, string>, registry: FlowLookup
): IntrinsicStatus => {
  const read = (id: string): IntrinsicStatus => {
    const status = flows[id]
    return status == null
      ? IntrinsicStatus.Planned
      : intrinsicOf(registry.flow(id), status) ?? IntrinsicStatus.Planned
  }

  if (type.intrinsic !== IntrinsicPolicy.All) {
    return read(primaryFlowOf(type))
  }

  return type.flows.map(read).reduce<IntrinsicStatus>(
    (least, intrinsic) => INTRINSIC_ORDER[intrinsic] < INTRINSIC_ORDER[least] ? intrinsic : least,
    IntrinsicStatus.Closed
  )
}
