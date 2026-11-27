import type { Card, Project, Specification } from '@owlmeans/planning'
import type { BotKit, WorkKind } from '../stack/consts.js'
import type { AreaKey, ViableTenancyDecision } from '../areas/types.js'
import type { ViableAppsDecision } from '../topology/apps/types.js'
import type { ViableStructureDecision } from '../topology/structure/types.js'
import type { UserStoryKind } from '../ba/consts.js'
import type { ConnectLlm, ConnectTarget } from '../connect/consts.js'
import type { ProjectOrigin } from '../convert/types.js'
import type { WorkcardActor } from '../design/consts.js'
import type { WorkcardWriteInput } from '../metadata/types.js'
import type { WorkMode } from '../execution/consts.js'
import type { ViableInitScope, ViableSpecOrigin, ViableTypeBy } from './consts.js'

// Kept as a type: card fields must satisfy `Record<string, unknown>`, which needs the implicit index signature of a type literal.
/**
 * What a `viable:project` card keeps under `fields`.
 *
 * The alias is the card's `code`, the name its `title`; the brief parts are specifications. Every
 * key is optional: a project created before a field existed carries none, and an absent value
 * means the platform default (inherit a mode, the default blueprint, a cloud slot).
 */
export type ViableProjectFields = {
  /** Aliases this project gave up. Names are retired, never freed to a sibling project. */
  formerAliases?: string[]
  /** The IETF tag generated UI text is written in. */
  language?: string
  /** The blueprint id the project was drawn with. */
  blueprint?: string
  /** The blueprint case classified from the prompt. Absent applies no patch. */
  blueprintCase?: string
  /** How a game is played; absent for every other case. */
  gameKind?: string
  /** Which kind of work a work-management product keeps; absent for every other case. */
  workKind?: WorkKind
  /**
   * The messaging platform ids a bot product lives on (at least one, `BOT_PLATFORM_ID_FORMAT`, the
   * plugins' own — the catalogue lists the supported ones); absent for every other case.
   */
  botPlatforms?: string[]
  /** What a bot product is for; absent for every other case. */
  botKit?: BotKit
  /** The requester's sentence the case (work management, bot) was verified against. */
  caseQuote?: string
  /** Where the tree lives; absent is the platform's own slot. */
  target?: ConnectTarget
  /** Where converted code came from; present only on an import. */
  origin?: ProjectOrigin
  /** Who performs a run's model calls on this project; absent inherits the owner's preference. */
  connectLlmMode?: ConnectLlm
  /** How this project's pipeline steps work; absent inherits the environment's default (hybrid). */
  workMode?: WorkMode
  /**
   * The landing-gate decision: which story a guest can start on the landing page.
   *
   * Three states, and the third is why this is an object rather than a code: ABSENT means the
   * decision was never made (an initialization that has not reached it, or a project older than
   * the gate), `story: null` means it WAS made and the answer is "no gate", and a code names the
   * story. A failed decision is never recorded — writing `null` for it would read as a decided
   * "none" and no later run would ask again. `at` is when it was decided, an ISO timestamp.
   */
  landing?: ViableLandingDecision
  /**
   * Whether the target splits its operators and its end users into tenant organizations.
   *
   * ABSENT means never decided and reads as a single-organization application, exactly as every
   * project before tenancy. It reaches a run through the blueprint reference (`StackRef.tenancy`)
   * only when a flag is on.
   */
  tenancy?: ViableTenancyDecision
  /**
   * The project's areas and the apps serving them, and who decided it.
   *
   * ABSENT means one app, `main`, over the four standard areas — every project created before apps
   * existed, untouched and never rewritten. It reaches a run through the blueprint reference
   * (`StackRef.apps`), and the target's topology record and the slot's claim follow it.
   */
  apps?: ViableAppsDecision | null
  /**
   * The project's structure — its parts (libraries, shared libraries, apps, apis, webs, workers), their
   * purposes and edges — and who decided it.
   *
   * Written only when it differs from the view {@link ViableProjectFields.apps} derives
   * (`projectStructureHelper.isDerived`), in the same `execute()` as the `apps` mirror. ABSENT: the
   * structure is the one `apps` derives (`projectStructureHelper.fromCard`), as for every project
   * created before structures existed.
   */
  structure?: ViableStructureDecision | null
  /**
   * Who chose the case: the person (`person` — a choice on the home screen, the structure step or the
   * import dialog) or the classifier (`model`). Absent on a project created before the choice existed.
   */
  caseBy?: ViableBlueprintBy | null
  /**
   * What the person chose at the confirm: the preview only, or the first spec implemented right away
   * — written by the confirm transit itself. Absent is the preview.
   */
  initScope?: ViableInitScope | null
}

// Kept as a type: a closed string union.
/** Who chose a project's case — see {@link ViableProjectFields.caseBy}. */
export type ViableBlueprintBy = 'person' | 'model'

/** The recorded landing-gate decision — see {@link ViableProjectFields.landing}. */
export interface ViableLandingDecision {
  /** The story card's CODE, or `null` for a decided "no gate". */
  story: string | null
  at: string
}

// Kept as a type: card fields must satisfy `Record<string, unknown>`, which needs the implicit index signature of a type literal.
/**
 * What a `viable:user-story` card keeps under `fields`.
 *
 * The narrative is the card's `title`, the flow ordinal its `order` (a double — a connective story
 * sits between two flow steps), the status its primary flow status.
 */
export type ViableWorkcardFields = {
  /**
   * The area the story's actor works in, by KEY — one of the four standard keys (the kind's word) or a
   * custom area of the project's app map; its screens hang under this area. Its kind is the map's
   * (`appMapHelper.kindOf`).
   */
  area: AreaKey
  /** The story whose screen is the project's front door. Exactly one per project. */
  primary: boolean
  /** Who acts; absent is a person. */
  actor?: WorkcardActor
  /** Why the last development did not end cleanly. Written as `''` to clear. */
  warning?: string
  /** Which half of the analysis the story came from. */
  kind?: UserStoryKind
  /**
   * The story a guest starts on the landing page — the landing gate's story. At most one per
   * project, and the project card's `fields.landing.story` names the same code.
   *
   * Its development gains a step that replaces the gate's sketch on the guest home with the real
   * component, and its full-scale screen reads the choices the guest carried over. Absent and
   * `false` read the same.
   */
  landing?: boolean
  /** Further area keys the story also reaches — its development fans out to each app serving one. */
  areas?: AreaKey[] | null
  /** Who decided the card's type — absent on a card written before the type check. */
  typeBy?: ViableTypeBy
  /** Why the type check retyped the card (`typeBy: model`); a person's retype clears it. */
  typeReason?: string
  /** The codes the card gave up when it was retyped, oldest first. */
  formerCodes?: string[]
}

// Kept as types: card fields must satisfy `Record<string, unknown>` (see above).
/** What a `viable:spec-card` keeps under `fields`. Its members are the cards whose `parents` name it. */
export type ViableSpecCardFields = {
  /** Why the last run did not end cleanly — `"k of n"` members done, among others. */
  warning?: string
  /** Where the spec came from. */
  origin?: ViableSpecOrigin
  typeBy?: ViableTypeBy
  typeReason?: string
  formerCodes?: string[]
}

/** What a `viable:feature` keeps under `fields`: one capability for one role. */
export type ViableFeatureFields = {
  /** The role's area, by KEY — the area the capability serves. */
  area?: AreaKey
  actor?: WorkcardActor
  warning?: string
  kind?: UserStoryKind
  typeBy?: ViableTypeBy
  typeReason?: string
  formerCodes?: string[]
}

/** What a `viable:improvement` keeps under `fields`. */
export type ViableImprovementFields = {
  area?: AreaKey
  areas?: AreaKey[] | null
  warning?: string
  kind?: UserStoryKind
  typeBy?: ViableTypeBy
  typeReason?: string
  formerCodes?: string[]
}

/** What a `viable:task` keeps under `fields` — never a value it set (those live in the config and the secrets). */
export type ViableTaskFields = {
  warning?: string
  typeBy?: ViableTypeBy
  typeReason?: string
  formerCodes?: string[]
}

/** What every work card's `fields` may hold — the union a reader branches on by the card's type. */
export type ViableWorkFields = ViableWorkcardFields | ViableSpecCardFields | ViableFeatureFields | ViableImprovementFields | ViableTaskFields

export interface ViableProjectCard extends Project {
  fields: ViableProjectFields
}

/** A user story card (`viable:user-story`). */
export interface ViableWorkcard extends Card {
  fields: ViableWorkcardFields
}

export interface ViableSpecCard extends Card {
  fields: ViableSpecCardFields
}

export interface ViableFeatureCard extends Card {
  fields: ViableFeatureFields
}

export interface ViableImprovementCard extends Card {
  fields: ViableImprovementFields
}

export interface ViableTaskCard extends Card {
  fields: ViableTaskFields
}

/** Any work card — a story, a spec, a feature, an improvement or a task. */
export type AnyViableWorkCard = ViableWorkcard | ViableSpecCard | ViableFeatureCard | ViableImprovementCard | ViableTaskCard

/** A document under a Viable card — the brief parts, the scaffold plan, a story design. */
export interface ViableSpecification extends Specification {}

/**
 * What a develop run hands the metadata store beside the card.
 *
 * The code, the narrative, the primary flag and the landing flag are the CARD's and are never
 * passed separately — a second copy is a second answer. `status` defaults to the card's own.
 */
export interface WorkcardWriteContent extends Omit<WorkcardWriteInput, 'code' | 'narrative' | 'primary' | 'landing' | 'status'> { status?: string }
