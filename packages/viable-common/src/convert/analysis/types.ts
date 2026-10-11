import type { ProjectArea } from '../../areas/consts.js'
import type { StoryKind } from '../../ba/consts.js'
import type { PurposeEvidenceSource, TaxonomyKind } from '../consts.js'
import type { OriginProof } from '../types.js'

export interface PurposeInference {
  purpose: string
  audience: string
  source: PurposeEvidenceSource
  confidence: number
  evidence: OriginProof[]
}

/** A flow the ORIGIN implements, before it is turned into stories. */
export interface OriginFlow {
  id: string
  name: string
  actor: string
  area: ProjectArea
  steps: string[]
  /** Whether the extracted story list covers it. An uncovered flow is a gap the user is shown. */
  covered: boolean
  kind: 'ui' | 'job' | 'cli'
  proofs: OriginProof[]
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
