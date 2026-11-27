import type { CatalogueChoice, ConnectProjectStructure, ConnectStructureSubmitBody } from '@owlmeans/viable-common'

/** What a create or a convert tool was asked to choose: the person's choice and the stop at the structure step. */
export interface StructureChoiceArgs {
  /** The {@link CatalogueChoice} the arguments name; `{}` when they name none. */
  choice: CatalogueChoice
  /** `review_structure: true`. */
  review: boolean
  /** Any choice argument or the review was given — the call needs the routes with the choice. */
  asked: boolean
}

/**
 * The structure step's tools (`project_structure`, `update_project_structure`) and the choice the create
 * and convert tools take — one helper for the arguments, the words and the refusal of an older platform.
 */
export interface StructureToolHelper {
  /**
   * The choice and the review a tool's arguments name (`blueprint`, `case`, `bot_platforms`, `tenancy`,
   * `review_structure`) — `blueprint` as the choice's `case`, `case` as its `category`, no stack.
   */
  choiceOf: (args: Record<string, unknown>) => StructureChoiceArgs
  /** `update_project_structure`'s body: only what its arguments name, `confirm` only when `true`. */
  submitOf: (args: Record<string, unknown>) => ConnectStructureSubmitBody
  /** Whether a submission is an advice round — `advise`, or a written ideas text. */
  isAdvice: (body: Pick<ConnectStructureSubmitBody, 'advise' | 'ideas'>) => boolean
  /**
   * A project's structure as lines: the step and its revision, the choice and the suggestion (in the tool's words:
   * `blueprint` the choice's case, `case` its category, the one stack unsaid), the areas, every
   * part with its keys and purpose, the issues, the latest advice and its changes, the ideas, the structure as
   * JSON to edit, and the `next:` line its status leads to.
   */
  renderStructure: (view: ConnectProjectStructure) => string
  /** The `next:` action a structure's status leads to. */
  nextOf: (view: ConnectProjectStructure) => string
  /** A bare 404 with no incident id: a platform without the route. */
  routeMissing: (error: unknown) => boolean
}
