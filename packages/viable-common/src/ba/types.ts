import { SpecCategory } from "./consts"
import type { ConnectingStoryKind, StoryKind } from "./consts.js"
import type { ProjectArea } from "../areas/consts.js"
import type { StoryDraft } from "../areas/types.js"
import type { StoryActor } from "../design/runtime.js"

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
 * stories that connect it.
 *
 * `kind` survives only as far as the consumer that creates the records; nothing downstream of the
 * story list has ever had a use for it.
 */
export interface MergedStoryDraft extends StoryDraft {
  kind: StoryKind
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

export interface AgentProject {
  name: string
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
