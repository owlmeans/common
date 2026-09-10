import type { ProjectArea } from '../areas/consts.js'
import type { ConnectLlm } from '../connect/consts.js'
import type { ModelRole } from '../execution/consts.js'
import type { TargetLayout } from '../integrity/consts.js'
import type {
  ArchitectureCase, ConversionStage, ConversionStoryKind, ConvertibilityReason,
  ConvertibilityVerdict, DumpKind, EntropyClass, EstimateSlice, FileClass, OriginKind, OriginShape,
  OriginState, PurposeEvidenceSource, SizeClass, StackFamily, StackId, TaxonomyKind, WorkspaceKind
} from './consts.js'

// --- inventory ------------------------------------------------------------------------------

/**
 * {@link FileStat} is declared in `../slot/types.js`, not here.
 *
 * It is the element of a `statTree` answer, and a slot command's result shape belongs to the slot
 * vocabulary the publisher and the connector both implement. Redeclaring it beside the census that
 * consumes it would give the root barrel two `FileStat`s and the two would drift the first time
 * one end added a field.
 */

/** One file, as the census classified it. `read` says whether its head was actually opened. */
export interface FileCensusEntry {
  path: string
  bytes: number
  ext: string
  cls: FileClass
  size: SizeClass
  entropy?: EntropyClass
  read: boolean
}

/** A package manifest found in the origin, and what it declares. */
export interface InventoryPackage {
  name?: string
  path: string
  /** The manifest file itself, root-relative — `package.json`, `pom.xml`, `go.mod`, … */
  manifest: string
  /** `member` for a package a workspace root declares; otherwise the workspace kind it declares. */
  kind: WorkspaceKind | 'member'
  deps: string[]
  scripts: Record<string, string>
  /** Whether something in the tree actually reaches it. See {@link UnlinkedRef}. */
  linked: boolean
}

export interface WorkspaceMember {
  name?: string
  path: string
  /** The manifest that declared this member. */
  declaredBy: string
  present: boolean
}

export interface SubmoduleRef {
  path: string
  url?: string
  present: boolean
}

/**
 * A directory holding code that nothing in the workspace declares, or a declaration with nothing
 * behind it.
 *
 * Reported rather than silently included: code the build never sees is code the origin does not
 * run, and converting it produces stories for behaviour the application does not have.
 */
export interface UnlinkedRef {
  path: string
  reason: 'not-a-member' | 'missing-submodule' | 'declared-not-present'
}

export interface WorkspaceReport {
  kind: WorkspaceKind
  globs: string[]
  members: WorkspaceMember[]
  submodules: SubmoduleRef[]
  unlinked: UnlinkedRef[]
}

/** A data file the origin carries that is too large, or too generated, to become seed data. */
export interface DumpRecord {
  path: string
  kind: DumpKind
  bytes: number
  format: string
  rows?: number
  /** At most {@link DUMP_SAMPLE_LINES} lines, read from the head. Never the whole file. */
  sample: string[]
  columns?: string[]
}

/** A small data file the code itself references — the data the application needs to make sense. */
export interface SeedRecord {
  name: string
  path: string
  bytes: number
  format: string
  rows?: number
  /** The source files that name it. The proof that it is seed rather than an export. */
  referencedBy: string[]
  carried: boolean
  /** Where it was written in the target, once carried. */
  target?: string
}

export interface InventorySummary {
  root: string
  files: number
  bytes: number
  read: number
  skipped: number
  /** A census that hit {@link CENSUS_MAX_ENTRIES}. Everything downstream must say so. */
  truncated: boolean
  byClass: Record<FileClass, number>
  bySize: Record<SizeClass, number>
  extensions: { ext: string, files: number, bytes: number }[]
  packages: InventoryPackage[]
  workspace: WorkspaceReport
  dumps: DumpRecord[]
  seeds: SeedRecord[]
  manifests: string[]
  vcs: { git: boolean, submodules: number }
  version: number
  takenAt: string
}

// --- detection ------------------------------------------------------------------------------

/** One piece of evidence for a stack, and how much it counts for. */
export interface StackSignal {
  id: StackId
  weight: number
  evidence: string
}

/**
 * What the pure detector concluded, before any model was asked.
 *
 * `confirmed` records whether the ONE model confirmation ran and agreed. `confirmedCase` is what
 * that same call answered about the architecture — asked together because a model that has just
 * read the manifests to name a framework has already read everything the case follows from, and
 * two calls over the same evidence is twice the price for one answer.
 */
export interface StackDetection {
  stack: StackId
  family: StackFamily
  alternative?: StackId
  confidence: number
  confirmed: boolean
  confirmedCase?: ArchitectureCase
  signals: StackSignal[]
  runtime?: string
  reason?: string
}

/** The ONE model confirmation of the detected stack, and the case it implies. */
export interface StackConfirmation {
  stack: StackId
  alternative?: StackId
  case: ArchitectureCase
  runtime?: string
  confidence: number
  reason: string
}

/**
 * What the tree IS, as the integrity manifest sees it.
 *
 * `violations` is how far a tree is from being a Viable target: zero means it IS one and the
 * conversion is a repair, a handful means somebody edited a generated project, and a large number
 * means it is foreign code that happens to be TypeScript.
 */
export interface OriginShapeReport {
  shape: OriginShape
  layout?: TargetLayout
  violations: number
  evidence: string[]
}

export interface ArchitectureVerdict {
  case: ArchitectureCase
  confidence: number
  reasons: string[]
  /** Two cases fit equally well; the user is asked which. */
  ambiguous: boolean
  /** The origin has no user interface at all — a case the implementation stage must design one for. */
  uiGap: boolean
}

export interface ConvertibilityReport {
  verdict: ConvertibilityVerdict
  reasons: ConvertibilityReason[]
  /** What makes the verdict `Refused`, phrased for a person. */
  blockers: string[]
  /** What makes it `Limited` — shown before the user pays for anything. */
  notes: string[]
}

// --- harness and taxonomy -------------------------------------------------------------------

/**
 * A pointer into the ORIGIN sources backing a claim.
 *
 * Every derived statement carries one. It is what makes a restored specification checkable rather
 * than a plausible story about somebody else's code — and it is what a purge has to strip, since
 * after the origin is deleted a path into it points at nothing.
 */
export interface OriginProof {
  path: string
  symbol?: string
  /**
   * The first and last line of the fragment — two entries, and a LIST rather than a tuple.
   *
   * `JSONSchemaType` types a tuple only as the draft-04 `items: [schema, schema]` form, and that
   * form is not in the JSON-schema subset a provider's structured output accepts: OpenAI answers
   * the whole request `400 … is not of type 'object', 'boolean'`, and every schema that embeds a
   * proof — the purpose, each taxonomy layer, the access model, a story's proofs — fails with it.
   * The count is stated by `minItems`/`maxItems` instead, where a validator can enforce it and a
   * provider can read it.
   */
  lines?: number[]
  note: string
}

/** What the origin says about itself in prose — the cheapest and best evidence there is. */
export interface HarnessDigest {
  readme?: string
  agents?: string
  docs: { path: string, title: string, chars: number }[]
  openapi: string[]
  migrations: string[]
  env: string[]
  scripts: Record<string, string>
  summary: string
}

export interface TaxonomyEntry {
  name: string
  path: string
  kind: TaxonomyKind
  symbol?: string
  entity?: string
  refs?: string[]
  note?: string
  proofs?: OriginProof[]
}

export interface TaxonomyPackage {
  name: string
  path: string
  /** What this package does in the origin's own terms — `api`, `web`, `worker`, `db`, … */
  role: string
  entries: Partial<Record<TaxonomyKind, TaxonomyEntry[]>>
}

/** A role the origin's own access model names, mapped onto the area whose audience holds it. */
export interface TaxonomyRole {
  name: string
  area: ProjectArea
  evidence: OriginProof[]
}

export interface TaxonomyPermission {
  name: string
  roles: string[]
  /** The origin's own guards, middlewares or decorators that enforce it. */
  guards: string[]
  evidence: OriginProof[]
}

export interface TaxonomySummary {
  case: ArchitectureCase
  packages: TaxonomyPackage[]
  areas: ProjectArea[]
  roles: TaxonomyRole[]
  permissions: TaxonomyPermission[]
  counts: Record<TaxonomyKind, number>
  /** Where the origin does something its own stack's conventions do not explain. */
  deviations: string[]
  /** What a whole taxonomy would have needed and the origin does not carry. */
  missingHarness: string[]
  version: number
}

// --- analysis and extraction ----------------------------------------------------------------

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

/**
 * The standing description of the origin every coder prompt carries.
 *
 * Capped at {@link ORIGIN_CARD_MAX_CHARS}: it rides on every generation call of the
 * implementation stage, so its length is multiplied by the number of calls the conversion makes.
 */
export interface OriginCard {
  stack: StackId
  case: ArchitectureCase
  purpose: string
  packages: string[]
  entities: string[]
  flows: string[]
  conventions: string[]
  chars: number
}

/** One line of the origin→target map the target's own agent memory keeps. */
export interface OriginMapEntry {
  origin: string
  target?: string
  kind: TaxonomyKind
  story?: string
}

// --- estimate -------------------------------------------------------------------------------

/**
 * One row of a stage's role plan — what the estimator believes a step will spend.
 *
 * Data rather than a measurement: the plan says which slices of the origin a step reads, how many
 * calls it makes and what it writes back, and the estimator projects tokens from the census. A
 * step that is per-story is multiplied by the story count instead of run once.
 */
export interface RolePlanEntry {
  step: string
  role: ModelRole
  slices: EstimateSlice[]
  /** What share of the named slices this step actually reads. */
  factor: number
  calls: number
  /** Fixed input tokens per call — the persona, the framing, the schema. */
  overhead: number
  /** Expected output tokens per call. */
  output: number
  perStory?: boolean
}

export interface RoleEstimate {
  role: ModelRole
  calls: number
  inputTokens: number
  outputTokens: number
  steps: string[]
}

/**
 * What one stage is expected to cost, as the platform stores it on the conversion record.
 *
 * Priced on the agent, where the model presets and the run mode are: a DELEGATED conversion runs
 * its model calls on the parent agent and costs the platform nothing, so `usd` and `credits` are
 * zero and `delegated` says why. `basis` is kept so a user can see what the number was projected
 * from rather than being handed a figure with no provenance.
 */
export interface ConversionEstimate {
  stage: ConversionStage
  version: number
  roles: RoleEstimate[]
  inputTokens: number
  outputTokens: number
  usd: number
  credits: number
  delegated: boolean
  basis: {
    files: number
    bytes: number
    storyCount?: number
    sampleRatio: number
    retryFactor: number
  }
  computedAt: string
}

/**
 * The per-story band shown before the implementation stage.
 *
 * A range, because a story's cost is set by how much code it turns out to need — which is exactly
 * what nothing knows before it is written. Shown with the disclaimer that says so.
 */
export interface StoryEstimateBand {
  minUsd: number
  maxUsd: number
  minCredits: number
  maxCredits: number
  perStory: { code: string, complexity: number, minUsd: number, maxUsd: number }[]
}

// --- record elements ------------------------------------------------------------------------

/**
 * A question the conversion answered for itself rather than asking.
 *
 * The web runs the inquiry policy `default`, so nothing blocks on a person who is not there. Every
 * defaulted answer is recorded — what was asked, what was assumed and why — and shown, because an
 * assumption nobody can see is indistinguishable from a fact.
 */
export interface ConversionAssumption {
  id: string
  question: string
  assumed: string
  because: string
  at: string
}

/** One asked-and-answered inquiry, as `docs/conversion/inquiries.md` records it. */
export interface InquiryRecord {
  id: string
  question: string
  kind: string
  answer?: string | string[]
  text?: string
  declined?: boolean
  at: string
}

/**
 * What the LIBRARY knows about a conversion — the state it writes and reads back on the volume.
 *
 * Distinct from the platform's conversion record: the library never touches a platform record, and
 * the platform never keeps the library's working state. This is what survives on the target's own
 * disk so a resumed or re-entered conversion knows where it was.
 */
export interface ConversionSnapshot {
  stage: ConversionStage
  originKind: OriginKind
  stack?: StackId
  case?: ArchitectureCase
  verdict?: ConvertibilityVerdict
  reasons?: ConvertibilityReason[]
  estimates?: ConversionEstimate[]
  assumptions?: ConversionAssumption[]
  originPresent: boolean
  answers?: Record<string, string | string[]>
  storyCodes?: string[]
  lastError?: string
  updatedAt: string
}

/** One answer, as the platform carries it into a resume. */
export interface ConversionAnswer {
  inquiryId: string
  value?: string
  declined?: boolean
}

/** The stack, as the platform shows it. Display shape — the detection itself stays in the library. */
export interface ConversionStackRef {
  id: StackId
  family: StackFamily
  label: string
  language: string
  framework?: string
}

/** The census, narrowed to what the platform record keeps and the dialog shows. */
export interface ConversionInventorySummary {
  files: number
  bytes: number
  packages: number
  workspace: WorkspaceKind
  dumps: number
  seeds: number
  unlinked: string[]
  truncated: boolean
}

/** The area/section/story tree the conversion dialog draws. */
export interface ConversionStructure {
  areas: {
    area: ProjectArea
    sections: {
      name: string
      stories: { code: string, title: string, primary?: boolean }[]
    }[]
  }[]
}

/** Set the profile-wide converter inference mode. */
export interface ConverterLlmBody {
  llmMode: ConnectLlm
}

/** Set the per-project converter inference mode; `null` inherits the profile's. */
export interface ConverterProjectLlmBody {
  llmMode: ConnectLlm | null
}

/**
 * Where a project's code came from, as the platform records it on the project.
 *
 * Written once at intake and never re-derived: a repository the user picked is an identity, and
 * recomposing it from a name would be a different repository the day somebody renames one.
 */
export interface ProjectOrigin {
  kind: OriginKind
  repoUrl?: string
  repoFullName?: string
  branch?: string
  state?: OriginState
  importedAt?: string
}

// --- model-answer wrappers ------------------------------------------------------------------

/** What one taxonomy layer's model call answers with. */
export interface TaxonomyEntryList {
  entries: TaxonomyEntry[]
}

/** What the access-model pass answers with — the roles and the permissions in one call. */
export interface TaxonomyRoleList {
  roles: TaxonomyRole[]
  permissions: TaxonomyPermission[]
}

export interface OriginFlowList {
  flows: OriginFlow[]
}

/** One data file, classified by the model where the path and the size alone were not enough. */
export interface SeedDetectionItem {
  path: string
  name: string
  /** Whether it is data the application needs rather than an export of what it produced. */
  seed: boolean
  /** Whether it should be carried into the target. */
  carry: boolean
  reason: string
}

export interface SeedDetection {
  items: SeedDetectionItem[]
}

/** What the origin's styles say about its design, in the terms the target's theme is written in. */
export interface DesignInference {
  concept: string
  palette: string[]
  radius?: string
  font?: string
}

// --- document frontmatter -------------------------------------------------------------------

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
