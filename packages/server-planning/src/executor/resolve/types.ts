import type { PlanningFacade, PlanningSchemaRegistry, TransitionExecution, Workcard, WorkcardKind } from '@owlmeans/planning'
import type { Resolved } from '../types.js'

/** Steps 1 and 4 of the write path, over one service runtime. */
export interface ResolveUtils {
  /**
   * Step 1: a deep copy with trimmed text, `parents ∋ parent` on a draft, and no duplicate `unset`
   * paths. The caller's object is never touched.
   */
  normalizeExecution: (input: TransitionExecution) => TransitionExecution
  /**
   * The parent type's rule for a child of `kind`/`type`: a project lists the `cardTypes` (and
   * `projectTypes`) it admits, and one declaring `scopedCardTypes` also admits a card type its layer
   * (`view`, the parent project's resolved schemas) defines as data. Project types are code's alone.
   *
   * @throws {CardTypeNotAllowed}
   */
  assertChildAllowed: (parent: Workcard, kind: WorkcardKind, type: string, view?: PlanningSchemaRegistry) => void
  /** The layer a parent project admits data-defined children through — `undefined` without a schema port. */
  childViewOf: (entityId: string, parent: Workcard) => Promise<PlanningSchemaRegistry | undefined>
  /**
   * Step 4: the card, its type and flow, its parent and — for a specification — its slot.
   *
   * @throws {WorkcardNotFound | PlanningScopeMismatch | UnknownWorkcardType | UnknownStatusFlow}
   * @throws {ParentNotFound | CardTypeNotAllowed | PlanningError}
   */
  resolveExecution: (facade: PlanningFacade, exec: TransitionExecution) => Promise<Resolved>
  /** The project a transition is filed under: a project's own id, else its parent's project. */
  projectFor: (resolved: Resolved, exec: TransitionExecution, cardId: string) => string | undefined
}
