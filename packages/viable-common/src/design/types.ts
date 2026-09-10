import type { ProjectArea } from '../areas/consts.js'
import type { StoryDesignRuntime } from './runtime.js'
import type { AccessList } from '../dev/types.js'
import type { UXTransition } from '../ux/types.js'

/**
 * One screen, as the design decided it.
 *
 * Every name here is ALLOCATED — through the project's name registry — rather than invented by
 * whoever writes the file later. That is the difference between a design and a wish: two runs days
 * apart address the same file because the design named it, not because they guessed alike.
 */
export interface StoryDesignScreen {
  /** The UX name, `{section}/{part}/{purpose}`. Not a path. */
  name: string
  /** The path-shaped stem the file and its aliases are derived from. */
  definition: string
  path: string
  /** The entrypoint alias. This is the key access rules and the navigation registry use. */
  alias: string
  url: string
  /** The AREA entrypoint this screen hangs under. Deterministic from the story's area. */
  parent: string
  /**
   * The top-menu group. ALWAYS the scaffold's reservation, never derived from `name`.
   *
   * The menu group is decided once, when the application is drawn, so a story's screens land in
   * the same section as the dashboard that links to them. A name-derived fallback puts them in a
   * group that dashboard is not in, and nothing fails.
   */
  section?: string
  /** True when the design adopted a file that already existed rather than naming a new one. */
  adopted: boolean
  specs: { ux: string, ui: string }
  /** Keys into `components`, in render order. */
  components: string[]
}

export interface StoryDesignComponent {
  name: string
  definition: string
  path: string
  viewModelPath: string
  adopted: boolean
  /** The screen this component is rendered into. */
  screen: string
  entities: string[]
  specs: { ux: string, ui: string }
  // `outcome` is deliberately ABSENT. Where a successful submit returns the actor is read per call
  // from the live registry, because the registry gains this story's own screens as the run goes;
  // a value decided at design time returns the user to a placeholder.
}

export interface StoryDesignType {
  path: string
  entity: string
  purpose: string
  /** Which components need it — what makes the flat list re-groupable per entity. */
  components: string[]
}

export interface StoryDesignResource {
  path: string
  entity: string
  type: string
  alias: string
  purpose: string
}

export interface StoryDesignModel {
  path: string
  entities: string[]
  /**
   * WRITE-BACK slot, filled by the implementation stage.
   *
   * `designSolution`'s only honest input is the type and resource CODE, which does not exist until
   * implementation has written it. Designing it earlier means designing it blind — against paths
   * with no content behind them — and the fixer then spends its budget on an API the coder never
   * saw declared. So it is designed late and recorded here, where a re-implementation reads it
   * back instead of paying for it again.
   */
  solution?: string
}

export interface StoryDesignEndpoint {
  alias: string
  method: string
  path: string
  purpose: string
}

export interface StoryDesignApi {
  path: string
  entity: string
  type: string
  model: string
  endpoints: StoryDesignEndpoint[]
}

export interface StoryDesignStore {
  path: string
  entity: string
  type: string
  api: string
}

/** What the design was written against, so a reader can tell whether it still applies. */
export interface StoryDesignProvenance {
  designedAt: string
  narrativeHash: string
  /** Specification + vision + design system, hashed together. */
  projectHash: string
  registryHash: string
  /**
   * Every path the design named, with the content hash it had at the time.
   *
   * An ARRAY, not a map: generated paths carry dots and slashes, and a Mongo key cannot hold them.
   * Advisory in any case — implementation ALWAYS re-reads a path and branches on what is there
   * now, so a tree that moved is a flipped branch rather than a crash.
   */
  paths: Array<{ path: string, hash: string }>
}

/**
 * Everything a story WILL be, decided before any of it is written.
 *
 * The design stage writes no file into the target; the implementation stage writes nothing that is
 * not named here. That split is what makes a story re-implementable without re-designing it — and
 * what makes a design reviewable, amendable and reusable at all.
 */
export interface StoryDesign {
  version: number
  code: string
  narrative: string
  area: ProjectArea
  /**
   * What the scaffold reserved when it drew the application.
   *
   * Read once, at the first design step, and copied in. Implementation never re-reads the story
   * file: one reader, one moment, one answer — otherwise a re-develop can drift out of the menu
   * group its own dashboard sits in.
   */
  reserved: { section?: string, screen?: string }
  entities: Array<{ name: string, description: string, dir: string }>
  screens: StoryDesignScreen[]
  components: StoryDesignComponent[]
  types: StoryDesignType[]
  resources: StoryDesignResource[]
  models: StoryDesignModel[]
  api: StoryDesignApi[]
  stores: StoryDesignStore[]
  transitions: UXTransition[]
  /**
   * WRITE-BACK slot, filled by the implementation stage.
   *
   * The design cannot even claim the KEYS: `describeApiAccess` reads the generated alias tree and
   * the model answers with the alias strings as written there. What is designed early is the set
   * of endpoints and screens; what they are guarded by is decided against the code that exists.
   */
  access: { list: AccessList, resolvedAt: Record<string, string> }
  /**
   * What this story needs beyond a screen, an endpoint and a table.
   *
   * Optional, and read through {@link runtimeOf} everywhere: a design written before the gate
   * existed carries none, and "none" is both the safe reading and the true one.
   */
  runtime?: StoryDesignRuntime
  provenance: StoryDesignProvenance
}

/** What a caller hands the store; the revision is the store's to allocate. */
export interface StoryDesignInput {
  projectId: string
  storyId?: string
  code: string
  kind: string
  payload: unknown
  runId?: string
}

/**
 * How the implementation stage reaches the design, without knowing where it lives.
 *
 * A port rather than a resource for the usual reason: two questions is the whole of what an
 * implementation step needs, and a port that small is satisfiable by a record store, a file, or a
 * test double.
 */
export interface StoryDesignPort {
  current: (projectId: string, code: string) => Promise<{ revision: number, design: StoryDesign } | null>
  put: (input: StoryDesignInput) => Promise<number>
}
