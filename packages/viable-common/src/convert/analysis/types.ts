import type { ProjectArea } from '../../areas/consts.js'
import type { StoryKind } from '../../ba/consts.js'
import type { OriginFlowDisposition, PlatformFlow, PurposeEvidenceSource, TaxonomyKind } from '../consts.js'
import type { OriginProof } from '../types.js'

export interface PurposeInference {
  purpose: string
  audience: string
  source: PurposeEvidenceSource
  confidence: number
  evidence: OriginProof[]
}

/** Whether a flow runs on screen, as background work, or from a command line. */
export type OriginFlowKind = 'ui' | 'job' | 'cli'

/**
 * One flow of the origin's census, as `flows.md` records it in its frontmatter.
 *
 * Everything but the proofs. A proof is a path into the origin, and a purge strips only the
 * frontmatter's `origin` key — a path anywhere else in the frontmatter would outlive the sources it
 * points into. The proofs stay in the document's body, where the purge's body rewrite reaches them.
 */
export interface OriginFlowEntry {
  id: string
  name: string
  actor: string
  area: ProjectArea
  steps: string[]
  /**
   * Whether the census thought the main flow already covers it — a HINT the consolidation is shown,
   * never a placement: the consolidation places every census flow, covered or not.
   */
  covered: boolean
  kind: OriginFlowKind
}

/** A flow the ORIGIN implements, before it is turned into stories. */
export interface OriginFlow extends OriginFlowEntry {
  proofs: OriginProof[]
}

/** One story the consolidation proposes: the census flows it stands for and its narrative. */
export interface OriginFlowGroup {
  /** The census ids this story covers. */
  members: string[]
  area: ProjectArea
  actor: string
  kind: OriginFlowKind
  /** The user-story narrative, in the main flow's voice and language. */
  story: string
}

/** A flow the platform already provides to every target, and which one. */
export interface OriginPlatformFlow {
  id: string
  provides: PlatformFlow
}

/**
 * The consolidation's model answer over the whole census.
 *
 * A PROPOSAL: the settling step makes it total — every census id placed exactly once, an unknown
 * id dropped, an omitted one placed `main` when the census called it covered and given a story
 * otherwise — so nothing a model leaves out is lost.
 */
export interface OriginFlowConsolidation {
  groups: OriginFlowGroup[]
  /** Census ids whose work a main-flow story already does end to end. */
  main: string[]
  platform: OriginPlatformFlow[]
}

/** One story of the settled plan, with the identity and the ordinal it is filed under. */
export interface OriginStoryGroup extends OriginFlowGroup {
  /** Stable: a digest of the sorted member ids, so two settlings of one answer name it alike. */
  id: string
  /** The card's `order`. Fixed when the plan is settled, so a replayed allocation files nothing twice. */
  ordinal: number
}

/** Where one census flow went. */
export interface OriginFlowPlacement {
  id: string
  disposition: OriginFlowDisposition
  /** The story group's id — present exactly when the disposition is `story`. */
  group?: string
  /** What the platform provides in its place — present exactly when the disposition is `platform`. */
  provides?: PlatformFlow
}

/**
 * The settled story plan the extraction allocates from.
 *
 * Durable in `flows.md`'s frontmatter, because the step that allocates it may run in another
 * process than the step that paid for it.
 */
export interface OriginStoryPlan {
  groups: OriginStoryGroup[]
  /** One per census flow, covered or not, in census order. */
  placements: OriginFlowPlacement[]
}

/** One entry of the restored story list, in the order the records are created in. */
export interface ConversionStoryRef {
  code: string
  story: string
  area: ProjectArea
  kind: ConversionStoryKind
  ordinal: number
}

/**
 * A restored story with the origin code that proves it.
 *
 * `complexity` is what the per-story price band is scaled by — derived from the proofs and the
 * algorithms, never asked of a model, so two runs over the same extraction price identically.
 */
export interface StoryProof {
  code: string
  narrative: string
  specification: string
  ux: string
  ui: string
  proofs: OriginProof[]
  algorithms: { name: string, steps: string[], proof: OriginProof }[]
  complexity: number
}

export interface AreaAlignment {
  areas: {
    area: ProjectArea
    roles: string[]
    permissions: string[]
    stories: string[]
  }[]
  /** Roles or permissions no area claimed. Recorded; never silently dropped. */
  unmapped: string[]
}

/** The machine-readable graph the manager's conversion diagram is drawn from. */
export interface StructureSummary {
  nodes: { id: string, label: string, kind: TaxonomyKind | 'package' | 'area' }[]
  edges: { from: string, to: string, label?: string }[]
}

export interface OriginFlowList {
  flows: OriginFlow[]
}

/** What the origin's styles say about its design, in the terms the target's theme is written in. */
export interface DesignInference {
  concept: string
  palette: string[]
  radius?: string
  font?: string
}

/**
 * What KIND of story a conversion produced.
 *
 * The analysis half of a conversion produces exactly the two kinds an ordinary initialization
 * does; a conversion adds one more — a `coverage` story, written so an area the origin serves but
 * the flow never reaches still has something in it.
 */
export type ConversionStoryKind = StoryKind | 'coverage'
