
export enum SpecCategory {
  BA = 'ba',
  UX = 'ux',
  UI = 'ui'
}

/**
 * The four screens that hold a flow together.
 *
 * A flow step acts on ONE record and never says how its actor reached it — which of the hundreds
 * waiting for them they opened, where they saw it was waiting at all, or where they look afterwards
 * to find out what became of it. These are the four shapes that answer that question.
 *
 * The taxonomy is CLOSED on purpose: a kind nothing derives is a screen nobody asked for, and every
 * story here costs a full develop run the project's owner pays for.
 */
export enum ConnectingStoryKind {
  /** The list of records waiting for THIS actor to perform their step. Derived from a hand-off. */
  Queue = 'queue',
  /** The directory of a kind of record, where an actor finds and opens the one they mean. */
  Index = 'index',
  /** One record gathered — what has happened to it, and the flow actions that start from it. */
  Record = 'record',
  /** An actor's own submissions and the state each reached. The sending side of a hand-off. */
  Tracker = 'tracker',
}

/**
 * Which half of the analysis a story came from.
 *
 * `flow` stories implement the numbered steps of the main flow — each adds value to one record.
 * `connective` stories are what a person needs to get from one step to the next. Persisted on the
 * story card as `fields.kind`, so the distinction survives the pipeline that drew it.
 */
export enum StoryKind {
  Flow = 'flow',
  Connective = 'connective',
  /**
   * A story the requester explicitly asked for that no main-flow step covers.
   *
   * Never primary and never a landing candidate: it exists because a stated requirement would
   * otherwise be dropped, not because the flow needs it.
   */
  Requested = 'requested',
}

/**
 * The four levels a stated requirement speaks to — what each one must do for it.
 *
 * `tech` is the architecture and data level (packages included), `ba` the business rules, `ux`
 * the behaviour and flow, `ui` the look. A requirement carries a text for the levels it touches
 * and nothing for the others.
 */
export enum RequirementPart {
  Tech = 'tech',
  Ba = 'ba',
  Ux = 'ux',
  Ui = 'ui',
}

/** The parts in the one order every rendering lists them in. */
export const REQUIREMENT_PARTS: readonly RequirementPart[] = Object.freeze([
  RequirementPart.Tech, RequirementPart.Ba, RequirementPart.Ux, RequirementPart.Ui,
])

/** What a stated requirement asks for. */
export enum RequirementKind {
  /** A kind of user does something the product must support. */
  Story = 'story',
  /** How something must work, be stored, look or behave. */
  Rule = 'rule',
  /** The platform already provides it. */
  Platform = 'platform',
  /** It asks for a stack or infrastructure the platform replaces; the note says what it does instead. */
  Unsupported = 'unsupported',
}

/** Where a stated requirement was quoted from. */
export enum RequirementSource {
  /** The project prompt — ids `R1`, `R2`, … */
  Prompt = 'prompt',
  /** A story a person typed — ids `S1`, `S2`, … */
  Story = 'story',
}

/** The shape version of a stored requirements document. */
export const REQUIREMENTS_VERSION = 1
/** The most requirements one prompt is split into. */
export const REQUIREMENTS_CAP = 40
/** The most `requested` stories one project's analysis adds. */
export const REQUESTED_STORY_CAP = 12
/** The most stories a person's typed story is split into. */
export const STORY_SPLIT_CAP = 3

/** The id prefix of a requirement quoted from the project prompt. */
export const REQUIREMENT_PROMPT_PREFIX = 'R'
/** The id prefix of a requirement quoted from a person's story. */
export const REQUIREMENT_STORY_PREFIX = 'S'

/**
 * The titles of the specification sections stated requirements add, rendered as `## <title>`.
 *
 * Numbered after the four sections the brief already carries, so a person reads them as the same
 * document. Byte-stable: a confirmed specification is matched back by its markers, never by these.
 */
export const REQUIREMENTS_SECTION_CAPABILITIES = 'Section 5. Requested capabilities'
export const REQUIREMENTS_SECTION_RULES = 'Section 6. Business rules'
export const REQUIREMENTS_SECTION_TECHNICAL = 'Section 7. Technical requirements'
export const REQUIREMENTS_SECTION_EXPERIENCE = 'Section 8. UX and UI requirements'
export const REQUIREMENTS_SECTION_PLATFORM = 'Section 9. Provided by the platform'

/** Sections 5–9, in order. */
export const REQUIREMENTS_SECTIONS: readonly string[] = Object.freeze([
  REQUIREMENTS_SECTION_CAPABILITIES,
  REQUIREMENTS_SECTION_RULES,
  REQUIREMENTS_SECTION_TECHNICAL,
  REQUIREMENTS_SECTION_EXPERIENCE,
  REQUIREMENTS_SECTION_PLATFORM,
])
