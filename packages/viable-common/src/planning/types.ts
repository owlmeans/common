import type { Card, Project, Specification } from '@owlmeans/planning'
import type { ProjectArea } from '../areas/consts.js'
import type { StoryKind } from '../ba/consts.js'
import type { ConnectLlm, ConnectTarget } from '../connect/consts.js'
import type { ProjectOrigin } from '../convert/types.js'
import type { StoryActor } from '../design/runtime.js'
import type { StoryWriteInput } from '../metadata/types.js'

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
  /** Where the tree lives; absent is the platform's own slot. */
  target?: ConnectTarget
  /** Where converted code came from; present only on an import. */
  origin?: ProjectOrigin
  /** Who performs a run's model calls on this project; absent inherits the owner's preference. */
  connectLlmMode?: ConnectLlm
  /** Who performs a conversion's model calls on this project; absent inherits. */
  converterLlmMode?: ConnectLlm
}

/**
 * What a `viable:user-story` card keeps under `fields`.
 *
 * The narrative is the card's `title`, the flow ordinal its `order` (a double — a connective story
 * sits between two flow steps), the status its primary flow status.
 */
export type ViableStoryFields = {
  /** The audience acting in the story; its screens hang under this area. */
  area: ProjectArea
  /** The story whose screen is the project's front door. Exactly one per project. */
  primary: boolean
  /** Who acts; absent is a person. */
  actor?: StoryActor
  /** Why the last development did not end cleanly. Written as `''` to clear. */
  warning?: string
  /** Which half of the analysis the story came from. */
  kind?: StoryKind
}

export interface ViableProjectCard extends Project {
  fields: ViableProjectFields
}

export interface ViableStoryCard extends Card {
  fields: ViableStoryFields
}

/** A document under a Viable card — the brief parts, the scaffold plan, a story design. */
export type ViableSpecification = Specification

/**
 * What a develop run hands the metadata store beside the card.
 *
 * The code, the narrative and the primary flag are the CARD's and are never passed separately — a
 * second copy is a second answer. `status` defaults to the card's own.
 */
export type StoryWriteContent =
  & Omit<StoryWriteInput, 'code' | 'narrative' | 'primary' | 'status'>
  & { status?: string }
