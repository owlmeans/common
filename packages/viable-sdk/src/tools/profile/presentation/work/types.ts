import type { ToolPresentation } from '../../types.js'

/**
 * The coercions every presenter reads a wire record through.
 *
 * A presenter is TOTAL: whatever a platform of any version answered — a field missing, a status
 * nobody has heard of, a value of the wrong type — it still yields a value its schema accepts,
 * because the MCP server validates the structured result and fails the whole call when it does not
 * fit. So nothing is read off a record directly: every member answers a well-typed value or
 * `undefined`, and {@link ShapeHelper.compact} drops the `undefined`s an optional field leaves.
 */
export interface ShapeHelper {
  /** Whether a value is a plain object — not an array, a primitive or null. */
  isRecord: (value: unknown) => value is Record<string, unknown>
  /** A plain object; an empty one for anything else (an array, a primitive, null). */
  record: (value: unknown) => Record<string, unknown>
  /** The plain objects of an array; none for anything that is not one. */
  records: (value: unknown) => Record<string, unknown>[]
  /** A non-empty string, cut at `cap` when one is given; `undefined` for anything else. */
  text: (value: unknown, cap?: number) => string | undefined
  /** A string a schema requires: the value when it is a string, `''` when it is not. */
  required: (value: unknown) => string
  /** The non-empty strings of an array; none for anything that is not one. */
  texts: (value: unknown) => string[]
  /** A string, or the non-empty strings of an array; `undefined` for anything else. */
  textOrTexts: (value: unknown) => string | string[] | undefined
  /** A finite number; `undefined` for anything else. */
  number: (value: unknown) => number | undefined
  /** A boolean; `undefined` for anything else. */
  flag: (value: unknown) => boolean | undefined
  /**
   * A stored or thrown refusal as a person reads it — the marker phrased exactly as the text result
   * phrases it, stack frames dropped, cut at `WARNING_CAP`. `undefined` for nothing to say.
   */
  phrase: (value: unknown) => string | undefined
  /** The phrased warnings of an array, the empty ones left out; none for anything that is not one. */
  phrases: (values: unknown) => string[]
  /** The array, or `undefined` when it is empty — an optional list is left out rather than sent empty. */
  nonEmpty: <T>(values: T[]) => T[] | undefined
  /** The object without its `undefined` members, so no optional field crosses as one. */
  compact: <T extends object>(value: T) => T
}

/**
 * One tool's structured result as a listing profile presents it: the base result and the call's
 * arguments in, the declared shape out — never throwing, whatever came in.
 */
export interface Presenter {
  (structured: object, args: Record<string, unknown>): Record<string, unknown>
}

/**
 * The presenters of the work-domain tools — projects, stories, batches, runs, conversions, the
 * question loop, the feeds and the local target. One member per result shape; several tools share
 * one where their results do (every tool answering a project status presents it the same way).
 */
export interface WorkPresenters {
  /** `describe_blueprints`: the installed registry, its cases and categories. */
  blueprints: Presenter
  /** A project status, as `project_status` answers it or wrapped (`{ project }`) as a write does. */
  projectStatus: Presenter
  /** `list_projects`. */
  projectList: Presenter
  /** `delete_project`. */
  projectDeleted: Presenter
  /** `describe_planning_kits`. */
  kits: Presenter
  /** `apply_planning_kit`. */
  kitApply: Presenter
  /** One page of `list_stories`, and the next page while there is one. */
  storyPage: Presenter
  /** The matches of `search_stories` — one page, and no next one: the search takes no page. */
  storySearch: Presenter
  /** One story card, or what a create committed before its card landed. */
  storyCard: Presenter
  /** A story's domain status, wrapped (`{ story, landing? }`) as the story tools answer it. */
  storyStatus: Presenter
  /** A story batch (`{ projectId?, batch }`), `null` when none has run, a cancel's stopped story. */
  storyBatch: Presenter
  /** `steer_agent`. */
  steer: Presenter
  /** `stop_agent`. */
  stop: Presenter
  /** A pipeline run's state (`{ pipeline }`). */
  pipeline: Presenter
  /** `check_convertible`. */
  convertCheck: Presenter
  /** A conversion's status, as `conversion_status` answers it or wrapped (`{ conversion }`). */
  conversion: Presenter
  /** `next_question`: whether a question was handed over, and its id. */
  question: Presenter
  /** `project_activity`. */
  activity: Presenter
  /** `notifications`. */
  notifications: Presenter
  /** `file_changes`. */
  fileChanges: Presenter
  /** `pickup_intent`. */
  intent: Presenter
  /** `local_status`. */
  localStatus: Presenter
  /** `run_local`. */
  runLocal: Presenter
  /** `local_setup_guide`, `set_local_service`. */
  setupReport: Presenter
  /** `list_slots`. */
  slots: Presenter
}

/** The structured output and presenter of every work-domain tool, keyed by tool name. */
export interface WorkPresentation extends Readonly<Record<string, ToolPresentation>> {}
