import { SpecCategory } from "./consts"
import type { ConnectingStoryKind, RequirementKind, RequirementPart, RequirementSource, StoryKind } from "./consts.js"
import type { ProjectArea } from "../areas/consts.js"
import type { StoryDraft } from "../areas/types.js"
import type { StoryActor } from "../design/consts.js"
import type { SubProject } from "../slot/consts.js"

export interface EntityList {
  entities: string[]
}

export interface StoryList {
  /** In flow order — story N implements numbered step N of the main flow. */
  stories: StoryDraft[]
}

/**
 * A story that CONNECTS two numbered steps of the main flow to each other.
 *
 * A {@link StoryDraft} plus an ANCHOR. `after` is not a position in the answer — it is the number
 * of the FLOW story whose result this one displays, so the consumer interleaves these into flow
 * order instead of appending them. The flow list is never rewritten or reordered by the call that
 * produces these.
 */
export interface ConnectingStoryDraft extends StoryDraft {
  kind: ConnectingStoryKind
  /** 1-based index into the flow story list that was passed in. Never 0, never past its end. */
  after: number
}

export interface ConnectingStoryList {
  stories: ConnectingStoryDraft[]
}

/**
 * One entry of the single ordered story list init persists — the flow interleaved with the
 * stories that connect it and the stories the requester asked for that the flow does not cover.
 *
 * `kind` is persisted on the story card (`fields.kind`). `after` is present on a connective entry
 * and on an anchored requested entry, and becomes the card's `follows` relationship: the 1-based
 * position, counted among the `flow` entries of the same list, of the flow story it follows —
 * already clamped, so it always names a flow story that list contains. A requested entry with no
 * anchor sits at the end of the list and carries none.
 */
export interface MergedStoryDraft extends StoryDraft {
  kind: StoryKind
  after?: number
}

/** An npm package a stated requirement names, and the target package it is installed into. */
export interface RequirementPackage {
  name: string
  side: SubProject
}

/**
 * One requirement the requester stated, quoted in their own words.
 *
 * The project card's `requirements` document holds every one of them with the story codes it
 * applies to; a story card's document holds its slice. What each level of the work must do for it
 * is split into {@link RequirementPart parts}, so a stage reads only the parts it is responsible for.
 */
export interface StatedRequirement {
  /** `R1`, `R2`, … quoted from the prompt; `S1`, `S2`, … quoted from a person's story. */
  id: string
  /** The requester's words, verified verbatim upstream. */
  quote: string
  /** One testable sentence in the requester's terms. */
  statement: string
  kind: RequirementKind
  /** What each level must do for it — present for the levels it touches only. */
  parts: Partial<Record<RequirementPart, string>>
  packages?: RequirementPackage[]
  /** `platform` / `unsupported`: what the platform does instead. */
  note?: string
  /** The story CODES it applies to — on the project document only. */
  stories?: string[]
  source: RequirementSource
}

/** The stored `requirements` specification of a project or a story card. */
export interface RequirementsDocument {
  version: number
  items: StatedRequirement[]
  /** When the requirements were assigned to story codes (ISO). */
  assignedAt?: string
  /** Requirement ids no story covers. */
  uncovered?: string[]
}

/**
 * A story drawn for requirements no main-flow step covers.
 *
 * `covers` names the requirement ids it exists for. `after` is an ANCHOR like a connecting story's:
 * the 1-based number of the flow story it follows; absent puts it at the end of the list.
 */
export interface RequestedStoryDraft extends StoryDraft {
  covers: string[]
  after?: number
}

export interface UserStory {
  story: string
  /**
   * The platform's own code for this story (`US-XXXXX`), when the caller has one.
   *
   * Optional because the aggregate is also built in contexts that have no record behind them,
   * but it is what makes a story's OWNERSHIP comparable: the scaffold stamps every placeholder it
   * draws with this code, so a develop run that keys its registry by anything else cannot tell
   * its own reserved placeholder from another story's — which is how one run came to rewrite a
   * different story's widget.
   */
  code?: string
  /** The audience acting in this story. Its screens hang under this area's entrypoint. */
  area: ProjectArea
  /**
   * WHO acts — a person, or one of the application's own machines.
   *
   * Optional and defaulting to a person, which is what every story is until a design stage says
   * otherwise. An ephemeral actor holds no permissions and owns no screen; it still carries an
   * `area`, because that says which human audience the work is FOR and therefore where its
   * progress is shown.
   */
  actor?: StoryActor
  entity: string
  entities: Entity[]
  screens: StoryScreen[]
}

export interface StoryScreen {
  name: string
  specs: Record<SpecCategory, string>
  description: string
  /** The top-menu group this screen belongs to. A label — never a URL segment. */
  section?: string
  components: StoryComponent[]
}

export interface StoryComponent {
  name: string
  specs: Record<SpecCategory, string>
  description: string
  entities: Entity[]
}

export interface Entity {
  name: string
  description: string
  attributes: Attribute[]
}

export interface Attribute {
  name: string
  description: string
}

/**
 * The project BRIEF a generator reads — assembled from the project card and its specifications
 * (`projectBriefOf`), never stored in this shape.
 */
export interface AgentProject {
  name: string
  /**
   * The project card's `code` — the slug the platform minted and every generated address is
   * composed from.
   *
   * Optional because a brief is also assembled before a project has one. A reader that needs a
   * slug prefers this over re-deriving one from `name`: a rename changes the name, never the code.
   */
  alias?: string
  description: string
  specification: string
  designSystem: string
  vision: string
  /**
   * The language every piece of generated UI text is written in, as an IETF tag (`en`, `pl`).
   *
   * Optional here and required on `ProjectMeta`, because the two answer different questions: a
   * brief may or may not state a language, while a project on disk always has one — whatever the
   * screens were written in. The store carries a stated one through and keeps the recorded one
   * otherwise; nothing re-decides it per pass, since a screen scaffolded in one language and
   * extended in another compiles, passes its tests, and is a mixed interface.
   */
  language?: string
}

export interface MainStoryProbability {
  story: string
  probability: number
}

export interface MainStoryCandidates {
  candidates: MainStoryProbability[]
}
