import type { IntrinsicStatus } from '../../consts.js'
import type { AnyTypeSchema, StatusDefinition, StatusFlowSchema, StatusTransitionRule } from '../../types.js'
import type { FlowLookup } from '../types.local.js'

/** The status-flow rules: statuses, the transitions a flow offers, and the intrinsic state. */
export interface StatusHelper {
  /** The primary flow id of a type — `flows[0]`. @throws {UnknownStatusFlow} when it declares none */
  primaryFlowOf: (type: AnyTypeSchema) => string
  flowIdsOf: (type: AnyTypeSchema) => string[]
  statusDefinitionOf: (flow: StatusFlowSchema, status: string) => StatusDefinition | undefined
  /** The intrinsic state a status maps onto, or `undefined` for a status the flow does not declare. */
  intrinsicOf: (flow: StatusFlowSchema, status: string) => IntrinsicStatus | undefined
  /** The status marked `initial`, else the first one. @throws {PlanningError} for a flow with none */
  initialStatusOf: (flow: StatusFlowSchema) => string
  isTerminal: (flow: StatusFlowSchema, status: string) => boolean
  /**
   * The rule a named transition follows from a status.
   *
   * A name may be declared several times with different `from` sets; the rule naming the status
   * explicitly wins, and a `'*'` rule of that name answers only when none does. A status the flow
   * does NOT declare — a card whose flow changed under it — matches every rule of the name, the first
   * declared answering: such a card can always move back onto the flow it now runs.
   */
  ruleOf: (flow: StatusFlowSchema, transition: string, from: string) => StatusTransitionRule | undefined
  canTransit: (flow: StatusFlowSchema, transition: string, from: string) => boolean
  /**
   * Every transition available from a status, one rule per name (the one `ruleOf` would pick), in
   * declaration order. `explicit: true` keeps only the rules offered to a person.
   */
  transitionsFrom: (flow: StatusFlowSchema, status: string, opts?: { explicit?: boolean }) => StatusTransitionRule[]
  /**
   * A new card's status per flow: every flow's initial status, with the primary one overridden by
   * `status` when the draft names one.
   *
   * @throws {UnknownStatusFlow}
   */
  initialFlowsOf: (type: AnyTypeSchema, registry: FlowLookup, status?: string) => Record<string, string>
  /**
   * The card's intrinsic state over its flows. {@link IntrinsicPolicy.Primary} reads the primary
   * flow; {@link IntrinsicPolicy.All} takes the least advanced flow. A status the flow does not
   * declare reads as planned.
   *
   * @throws {UnknownStatusFlow}
   */
  resolveIntrinsic: (type: AnyTypeSchema, flows: Record<string, string>, registry: FlowLookup) => IntrinsicStatus
}
