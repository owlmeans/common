import type { ProjectArea } from '../../areas/consts.js'
import type {
  ArchitectureCase, ConversionStage, ConvertibilityVerdict, OriginKind, PurposeEvidenceSource, StackFamily, StackId
} from '../consts.js'

/** Where the per-story and per-seed conversion documents live in a target. */
export interface ConversionDocHelper {
  /** The restored story document of one story code. */
  conversionStoryDoc: (code: string) => string
  /** The description document of one carried seed. */
  conversionSeedDoc: (name: string) => string
  /** The carried seed data file itself. */
  conversionSeedData: (name: string, ext: string) => string
}

export interface ConversionDocMeta {
  version: number
  stage: ConversionStage
  updatedAt: string
}

export interface ConversionIndexMeta extends ConversionDocMeta {
  origin: string
  originKind: OriginKind
  stack: StackId
  case: ArchitectureCase
  verdict: ConvertibilityVerdict
  purged: boolean
}

export interface InventoryDocMeta extends ConversionDocMeta {
  files: number
  bytes: number
  packages: number
  dumps: number
  seeds: number
  truncated: boolean
}

export interface StackDocMeta extends ConversionDocMeta {
  stack: StackId
  family: StackFamily
  alternative?: StackId
  confidence: number
  confirmed: boolean
}

export interface ArchitectureDocMeta extends ConversionDocMeta {
  case: ArchitectureCase
  confidence: number
  ambiguous: boolean
  uiGap: boolean
}

export interface HarnessDocMeta extends ConversionDocMeta {
  docs: number
  hasReadme: boolean
  hasAgents: boolean
  openapi: boolean
}

export interface TaxonomyDocMeta extends ConversionDocMeta {
  case: ArchitectureCase
  packages: number
  counts: Record<string, number>
  deviations: number
}

export interface PurposeDocMeta extends ConversionDocMeta {
  source: PurposeEvidenceSource
  confidence: number
}

export interface AnalysisDocMeta extends ConversionDocMeta {
  name: string
  language: string
  entities: string[]
  flowSteps: number
}

export interface StoryListDocMeta extends ConversionDocMeta {
  total: number
  flow: number
  connective: number
  coverage: number
}

export interface StoryProofDocMeta extends ConversionDocMeta {
  code: string
  area: ProjectArea
  origin: string[]
  complexity: number
}

export interface EstimateDocMeta extends ConversionDocMeta {
  stages: ConversionStage[]
  inputTokens: number
  outputTokens: number
}

export interface AssumptionsDocMeta extends ConversionDocMeta {
  count: number
}

export interface InquiriesDocMeta extends ConversionDocMeta {
  asked: number
  answered: number
  declined: number
}

export interface DumpsDocMeta extends ConversionDocMeta {
  dumps: number
  bytes: number
  sampled: number
}

export interface SeedDocMeta extends ConversionDocMeta {
  name: string
  format: string
  bytes: number
  rows?: number
  carried: boolean
}

export interface AreasDocMeta extends ConversionDocMeta {
  areas: ProjectArea[]
  roles: number
  permissions: number
}

export interface StructureDocMeta extends ConversionDocMeta {
  nodes: number
  edges: number
}

export interface OriginCardDocMeta extends ConversionDocMeta {
  chars: number
  stack: StackId
  case: ArchitectureCase
}

/** The frontmatter of the target's own `.agents/memory/conversion.md` node. */
export interface ConversionMemoryMeta {
  version: number
  stage: ConversionStage
  case: ArchitectureCase
  stack: StackId
  origin: string
  purged: boolean
  updatedAt: string
}
