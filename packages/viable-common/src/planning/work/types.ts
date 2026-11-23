import type { Workcard } from '@owlmeans/planning'
import type { AnyViableWorkCard, ViableWorkFields } from '../types.js'

/** Reading work cards of every kind — what a rule, a board or a run asks before it branches on the type. */
export interface ViableWorkHelper {
  /** One of the five work types (`VIABLE_WORK_TYPES`). */
  isWorkType: (type?: string | null) => boolean
  /** A work card — kind `card` AND a work type. */
  isWorkCard: (card?: Workcard | null) => card is AnyViableWorkCard
  /** A spec card or a feature — a type that holds members. */
  isContainerType: (type?: string | null) => boolean
  /** A container work card. */
  isContainer: (card?: Workcard | null) => card is AnyViableWorkCard
  /**
   * The container a member sits in: its second `parents` entry (the project stays the primary
   * parent). `undefined` for a card in no container.
   */
  containerIdOf: (card: Pick<Workcard, 'parent' | 'parents'>) => string | undefined
  /**
   * `fields` fitted to a work type: only the keys the type declares, and the required ones the type
   * needs filled — a user story's `area` (`guest` when none) and `primary` (`false`). What a create
   * whose type changed, or a retype, writes.
   */
  fieldsFor: (type: string, fields?: Record<string, unknown> | null) => ViableWorkFields
  /**
   * The paths a retype to `type` must clear: every `fields.<key>` the card holds that the type does
   * not declare.
   */
  unsetFor: (type: string, fields?: Record<string, unknown> | null) => string[]
}
