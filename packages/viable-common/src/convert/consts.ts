/**
 * The conversion vocabulary — what the platform says about an ORIGIN project it did not generate.
 *
 * A converted project has two histories on one volume: the tree somebody else wrote, and the
 * Viable target grown around it. Every layer of the conversion — the library that reads the
 * origin, the agent that runs the stages, the manager API that prices them and the browser that
 * shows the dialog — has to name the same things the same way, so the names live here rather than
 * in whichever package happened to need them first. That is the same reason the slot command
 * vocabulary and the connector protocol sit beside this file: three or four independent runtimes
 * answer them and none of them owns the words.
 *
 * Nothing here is a heuristic and nothing here reads a file. These are enumerations, path layouts
 * and budgets — the parts that must be identical everywhere or the conversion means different
 * things at each hop.
 */

import type { StoryKind } from '../ba/consts.js'
import { HISTORY_FILE, METADATA_DIRS } from '../metadata/consts.js'

/**
 * The four stages of a conversion, in order.
 *
 * Each is ONE platform pipeline run and ends at a decision the user makes: intake establishes what
 * the origin IS, analysis restores the specification Viable would have written for it, extraction
 * restores the story list with proofs from the code, and implementation re-implements those
 * stories with the ordinary Viable helpers. A stage is never entered by skipping the one before
 * it ({@link canEnter}) — every stage reads the documents the previous stage wrote.
 */
export enum ConversionStage {
  Intake = 'intake',
  Analysis = 'analysis',
  Extraction = 'extraction',
  Implementation = 'implementation',
}

/**
 * Where a conversion stands.
 *
 * `Awaiting` and `Waiting` are deliberately different words for deliberately different things:
 * `Awaiting` means the platform has finished a stage and is waiting for the USER to decide what
 * happens next, `Waiting` means a run is parked mid-step on an inquiry and will continue by
 * itself the moment somebody answers it. A UI that collapses the two offers a decision button for
 * a run that is not asking for one, and shows a spinner for a run that will never move again.
 */
export enum ConversionStatus {
  Pending = 'pending',
  Running = 'running',
  /** A stage finished; the next one starts only on a {@link ConversionDecision}. */
  Awaiting = 'awaiting',
  /** A run is parked on an inquiry — see the connector's inquiry payload. */
  Waiting = 'waiting',
  Failed = 'failed',
  Cancelled = 'cancelled',
  Done = 'done',
}

/**
 * What the user decides at a stage boundary.
 *
 * `Leave` is the deliberate terminal of a conversion that keeps the analysis and never
 * re-implements anything — a perfectly ordinary outcome, not a failure. `Retry` re-runs the stage
 * that failed or stalled, and `Cancel` ends the conversion without destroying the project.
 */
export enum ConversionDecision {
  Analyze = 'analyze',
  Extract = 'extract',
  Implement = 'implement',
  Leave = 'leave',
  Retry = 'retry',
  Cancel = 'cancel',
}

/** Where the origin code came from. Never what the tree IS — that is {@link OriginShape}. */
export enum OriginKind {
  Github = 'github',
  Local = 'local',
}

/**
 * What the origin tree turned out to be.
 *
 * Separate from {@link OriginKind} because the two answer different questions and a single word
 * for both is how a GitHub clone of a Viable project came to be treated as foreign code. `Viable`
 * means the integrity manifest recognises it and the conversion is a REPAIR; `CreateApp` is an
 * OwlMeans scaffold that never became a Viable target; `Foreign` is everything else; `Empty` is a
 * tree with no sources in it at all.
 */
export enum OriginShape {
  Viable = 'viable',
  CreateApp = 'create-app',
  Foreign = 'foreign',
  Empty = 'empty',
}

/**
 * Whether the origin sources are still on the volume.
 *
 * `Purged` is not `Absent`: a purged conversion has had its origin deleted on request AND its
 * documents rewritten to stop quoting it, and that is irreversible. `Absent` is simply "not there
 * yet" — the ordinary state before intake clones anything.
 */
export enum OriginState {
  Absent = 'absent',
  Present = 'present',
  Purged = 'purged',
}

/**
 * The shape of the application, as one of five cases.
 *
 * ONE layer of sub-pipelines and no more. A case decides which taxonomy pipeline reads the origin
 * and which role plan prices it; the STACK decides only which skill pack is loaded as data. Cases
 * multiply the code, stacks multiply a table — which is why there are five of the first and
 * twenty-odd of the second.
 */
export enum ArchitectureCase {
  SpaApi = 'spa-api',
  SsrMonolith = 'ssr-monolith',
  ApiOnly = 'api-only',
  CliPipeline = 'cli-pipeline',
  /** The origin already IS a Viable target; the conversion repairs it rather than re-deriving it. */
  ViableRepair = 'viable-repair',
}

/** The language ecosystem a stack belongs to. */
export enum StackFamily {
  Js = 'js',
  Java = 'java',
  Kotlin = 'kotlin',
  Go = 'go',
  Python = 'python',
  Php = 'php',
  Csharp = 'csharp',
  Elixir = 'elixir',
  Ruby = 'ruby',
  OwlMeans = 'owlmeans',
  Unknown = 'unknown',
}

/**
 * The frameworks the converter carries a skill pack for.
 *
 * DATA, not code: a stack contributes signatures to detection and a short pack of conventions to
 * the prompts, and nothing else branches on it. Adding one is a table entry plus a pack; adding an
 * {@link ArchitectureCase} is a pipeline.
 */
export enum StackId {
  NextJs = 'next',
  Nuxt = 'nuxt',
  ReactSpa = 'react-spa',
  VueSpa = 'vue-spa',
  AngularSpa = 'angular-spa',
  Express = 'express',
  Fastify = 'fastify',
  NestJs = 'nest',
  LangchainJs = 'langchain-js',
  SpringBoot = 'spring-boot',
  Ktor = 'ktor',
  KotlinSpring = 'kotlin-spring',
  GoNetHttp = 'go-net-http',
  Gin = 'gin',
  Echo = 'echo',
  Django = 'django',
  FastApi = 'fastapi',
  Flask = 'flask',
  LangchainPy = 'langchain-py',
  Laravel = 'laravel',
  Symfony = 'symfony',
  AspNetCore = 'aspnet-core',
  Phoenix = 'phoenix',
  Rails = 'rails',
  OwlMeansCreateApp = 'owlmeans-create-app',
  Viable = 'viable',
  Unknown = 'unknown',
}

/**
 * Stack → family. TOTAL over {@link StackId}, and a test pins it.
 *
 * A partial map with a fall-through default is the same bug the target-role vocabulary carried:
 * every unlisted member answers with whatever the default is, nothing fails, and the answers are
 * simply about another language.
 */
export const STACK_FAMILY: Record<StackId, StackFamily> = {
  [StackId.NextJs]: StackFamily.Js,
  [StackId.Nuxt]: StackFamily.Js,
  [StackId.ReactSpa]: StackFamily.Js,
  [StackId.VueSpa]: StackFamily.Js,
  [StackId.AngularSpa]: StackFamily.Js,
  [StackId.Express]: StackFamily.Js,
  [StackId.Fastify]: StackFamily.Js,
  [StackId.NestJs]: StackFamily.Js,
  [StackId.LangchainJs]: StackFamily.Js,
  [StackId.SpringBoot]: StackFamily.Java,
  [StackId.Ktor]: StackFamily.Kotlin,
  [StackId.KotlinSpring]: StackFamily.Kotlin,
  [StackId.GoNetHttp]: StackFamily.Go,
  [StackId.Gin]: StackFamily.Go,
  [StackId.Echo]: StackFamily.Go,
  [StackId.Django]: StackFamily.Python,
  [StackId.FastApi]: StackFamily.Python,
  [StackId.Flask]: StackFamily.Python,
  [StackId.LangchainPy]: StackFamily.Python,
  [StackId.Laravel]: StackFamily.Php,
  [StackId.Symfony]: StackFamily.Php,
  [StackId.AspNetCore]: StackFamily.Csharp,
  [StackId.Phoenix]: StackFamily.Elixir,
  [StackId.Rails]: StackFamily.Ruby,
  [StackId.OwlMeansCreateApp]: StackFamily.OwlMeans,
  [StackId.Viable]: StackFamily.OwlMeans,
  [StackId.Unknown]: StackFamily.Unknown,
}

/**
 * Whether the platform will convert this origin at all.
 *
 * `Limited` is not a refusal — it is a conversion that will produce less than a whole one, and the
 * user is told which parts before they pay for it.
 */
export enum ConvertibilityVerdict {
  Ready = 'ready',
  Limited = 'limited',
  Refused = 'refused',
}

/** Why a {@link ConvertibilityVerdict} is not `Ready`. Every one of them is shown to the user. */
export enum ConvertibilityReason {
  Empty = 'empty',
  NoSources = 'no-sources',
  TooLarge = 'too-large',
  UnknownStack = 'unknown-stack',
  /** A workspace member or a directory nothing declares — its code would be read as orphaned. */
  UnlinkedSubproject = 'unlinked-subproject',
  MissingSubmodule = 'missing-submodule',
  BinaryOnly = 'binary-only',
  Encrypted = 'encrypted',
  AlreadyConverted = 'already-converted',
}

/** What a file in the origin is, as far as the census can tell from its path and its head. */
export enum FileClass {
  Source = 'source',
  Config = 'config',
  Manifest = 'manifest',
  Doc = 'doc',
  Style = 'style',
  Template = 'template',
  Test = 'test',
  Data = 'data',
  Binary = 'binary',
  Lock = 'lock',
  Generated = 'generated',
  Unknown = 'unknown',
}

/** Size bands: `< 2 KB`, `< 32 KB`, `< 256 KB`, `< 2 MB`, `>= 2 MB`. See {@link SIZE_CLASS_BOUNDS}. */
export enum SizeClass {
  Tiny = 'tiny',
  Small = 'small',
  Medium = 'medium',
  Large = 'large',
  Huge = 'huge',
}

/** How readable a file's head is — the cheap stand-in for "is this text a model can use". */
export enum EntropyClass {
  Text = 'text',
  /** Printable, but minified, base64-ish or otherwise not prose the model can reason over. */
  Dense = 'dense',
  Opaque = 'opaque',
}

/** What a data file in the origin is for. */
export enum DumpKind {
  /** Small and referenced by the code — the data the app needs to make sense. Carried over. */
  Seed = 'seed',
  /** A large export. Sampled, described, never carried. */
  Bulk = 'bulk',
  Fixture = 'fixture',
  Migration = 'migration',
}

/** How the origin declares its packages, when it has more than one. */
export enum WorkspaceKind {
  Single = 'single',
  BunWorkspaces = 'bun',
  PnpmWorkspaces = 'pnpm',
  YarnWorkspaces = 'yarn',
  Lerna = 'lerna',
  Nx = 'nx',
  Turbo = 'turbo',
  GoWork = 'go-work',
  Maven = 'maven',
  Gradle = 'gradle',
}

/**
 * The layers a taxonomy pass reads out of the origin, one model call each.
 *
 * Ordered by what a later layer needs from an earlier one ({@link TAXONOMY_ORDER}): types before
 * the resources that store them, resources before the models that compose them, screens before
 * the navigation that addresses them.
 */
export enum TaxonomyKind {
  Type = 'type',
  Resource = 'resource',
  Model = 'model',
  Service = 'service',
  ViewModel = 'view-model',
  Component = 'component',
  Layout = 'layout',
  Screen = 'screen',
  Navigation = 'navigation',
  Endpoint = 'endpoint',
  Job = 'job',
}

/** The order the taxonomy layers are read in. A permutation of {@link TaxonomyKind}; a test pins it. */
export const TAXONOMY_ORDER: TaxonomyKind[] = [
  TaxonomyKind.Type,
  TaxonomyKind.Resource,
  TaxonomyKind.Model,
  TaxonomyKind.Service,
  TaxonomyKind.ViewModel,
  TaxonomyKind.Component,
  TaxonomyKind.Layout,
  TaxonomyKind.Screen,
  TaxonomyKind.Navigation,
  TaxonomyKind.Endpoint,
  TaxonomyKind.Job,
]

/**
 * Where the answer to "what is this application for" came from, best first.
 *
 * It is recorded because the confidence of the whole analysis follows from it: a purpose read out
 * of a written harness is a statement of intent, one inferred from screen labels is a guess.
 */
export enum PurposeEvidenceSource {
  Harness = 'harness',
  Checks = 'checks',
  Ui = 'ui',
  Jobs = 'jobs',
  Manifest = 'manifest',
}

/** The input slices a cost estimate projects a stage's token spend from. */
export enum EstimateSlice {
  Manifests = 'manifests',
  Harness = 'harness',
  Sources = 'sources',
  Styles = 'styles',
  Config = 'config',
  Taxonomy = 'taxonomy',
  Spec = 'spec',
  StoryList = 'story-list',
  OriginCard = 'origin-card',
  /** A fixed per-call overhead that does not scale with the origin. */
  Fixed = 'fixed',
}

/**
 * What KIND of story a conversion produced.
 *
 * The analysis half of a conversion produces exactly the two kinds an ordinary initialization
 * does; a conversion adds one more — a `coverage` story, written so an area the origin serves but
 * the flow never reaches still has something in it.
 */
export type ConversionStoryKind = StoryKind | 'coverage'

/**
 * Where the origin's own sources live inside the target's volume.
 *
 * One directory, at the sandbox root, named so nothing a generator writes can collide with it.
 * Everything that walks the tree must skip it — the source listing, the file watcher, every build,
 * and the placeholder walk an initialization does — or the origin is compiled, watched and
 * type-checked as if it were the generated application.
 */
export const CONVERTED_ORIGIN_DIR = '__viable_converted'

/**
 * Directories excluded from every source listing of a target project.
 *
 * ONE constant, spread by the library-local helper, the publisher and the connector SDK executor.
 * Three copies of this list is three chances for one of them to keep listing the origin, and the
 * symptom is a coder helper reading a foreign framework's files as if they were the target's.
 */
export const SOURCE_LIST_EXCLUSIONS: readonly string[] = [...METADATA_DIRS, CONVERTED_ORIGIN_DIR]

/**
 * What stays at the project root through a relocation AND through an initialization, whatever
 * the caller names.
 *
 * These three belong to the SLOT, not to the project inside it: the git repository every rollback
 * works through, the metadata file the publisher configures itself from, and the project's own
 * rolling history — which is NESTED, and therefore the reason both operations run through a prune
 * walk rather than over a `readdir`.
 *
 * ONE list, for the same reason as {@link SOURCE_LIST_EXCLUSIONS}: the publisher and the library
 * helper act on the SAME volume, and two hand-synced copies is two chances for them to disagree
 * about the same three paths. They did — a conversion's `relocate` carefully preserved the
 * developer's `.git` and the `initializeProject` one step later deleted it, removing the only
 * rollback path with nothing failing.
 *
 * The connector's local helper deliberately keeps a DIFFERENT set: it empties a directory the
 * developer owns rather than a volume the platform owns, so `.viable/` and the `.env` files the
 * platform cannot re-derive are in it and `sandbox-meta.json`, which no local project has, is not.
 */
export const RELOCATE_ALWAYS_KEEP: readonly string[] = ['.git', 'sandbox-meta.json', HISTORY_FILE]

/**
 * The pipeline alias prefixes a conversion run carries.
 *
 * Two, because a conversion is a platform pipeline that composes library pipelines as steps: the
 * platform's own runs are `vib:project:convert:<stage>` and the library's are `vib:convert:<name>`.
 * Anything filtering progress by pipeline — the browser's thinking journal, the reconciler's run
 * lookup — must match on BOTH, or half of a conversion's progress is invisible.
 */
export const CONVERSION_PIPELINE_PREFIXES = ['vib:project:convert:', 'vib:convert:'] as const

/**
 * Where a conversion's documents live inside the target project.
 *
 * Under `docs/`, beside the metadata an ordinary project carries, because they are the same kind
 * of thing: markdown the pipeline writes and the next pipeline reads back. They are the ONLY
 * durable record of what the origin was — a purge deletes the origin sources, and after it these
 * documents are what remains.
 */
export const CONVERSION_DIR = 'docs/conversion'
export const CONVERSION_INDEX_FILE = `${CONVERSION_DIR}/README.md`
export const CONVERSION_INVENTORY_FILE = `${CONVERSION_DIR}/inventory.md`
export const CONVERSION_STACK_FILE = `${CONVERSION_DIR}/stack.md`
export const CONVERSION_ARCHITECTURE_FILE = `${CONVERSION_DIR}/architecture.md`
export const CONVERSION_HARNESS_FILE = `${CONVERSION_DIR}/harness.md`
export const CONVERSION_TAXONOMY_FILE = `${CONVERSION_DIR}/taxonomy.md`
export const CONVERSION_PURPOSE_FILE = `${CONVERSION_DIR}/purpose.md`
export const CONVERSION_DESIGN_FILE = `${CONVERSION_DIR}/design.md`
export const CONVERSION_ANALYSIS_FILE = `${CONVERSION_DIR}/analysis.md`
export const CONVERSION_STORY_LIST_FILE = `${CONVERSION_DIR}/story-list.md`
export const CONVERSION_FLOWS_FILE = `${CONVERSION_DIR}/flows.md`
export const CONVERSION_AREAS_FILE = `${CONVERSION_DIR}/areas.md`
export const CONVERSION_SCAFFOLD_FILE = `${CONVERSION_DIR}/scaffold.md`
export const CONVERSION_STRUCTURE_FILE = `${CONVERSION_DIR}/structure.md`
export const CONVERSION_ESTIMATE_FILE = `${CONVERSION_DIR}/estimate.md`
export const CONVERSION_ASSUMPTIONS_FILE = `${CONVERSION_DIR}/assumptions.md`
export const CONVERSION_INQUIRIES_FILE = `${CONVERSION_DIR}/inquiries.md`
export const CONVERSION_DUMPS_FILE = `${CONVERSION_DIR}/dumps.md`
export const CONVERSION_ORIGIN_CARD_FILE = `${CONVERSION_DIR}/origin.md`

/** One document per extracted story, named by the platform's story code. */
export const CONVERSION_STORY_DIR = `${CONVERSION_DIR}/stories`
/** One document per carried seed file, describing what it is and how to load it. */
export const CONVERSION_SEED_DIR = `${CONVERSION_DIR}/seed`
/** The carried seed data itself, beside its description. */
export const CONVERSION_SEED_DATA_DIR = `${CONVERSION_SEED_DIR}/data`

export const conversionStoryDoc = (code: string): string => `${CONVERSION_STORY_DIR}/${code}.md`
export const conversionSeedDoc = (name: string): string => `${CONVERSION_SEED_DIR}/${name}.md`
export const conversionSeedData = (name: string, ext: string): string =>
  `${CONVERSION_SEED_DATA_DIR}/${name}.${ext}`

/**
 * The two agent-memory nodes a conversion writes into the TARGET's own harness.
 *
 * Flat files, not a directory: the target's agent-memory harness states that the graph structure
 * lives in scopes and wiki-links rather than in subdirectories, and that harness is read by the
 * user's own agents inside the slot.
 */
export const CONVERSION_MEMORY_FILE = '.agents/memory/conversion.md'
export const CONVERSION_ORIGIN_MAP_FILE = '.agents/memory/conversion-origin.md'

/** Every FIXED conversion document. The per-story and per-seed ones are named by their helpers. */
export const CONVERSION_DOCS: readonly string[] = [
  CONVERSION_INDEX_FILE,
  CONVERSION_INVENTORY_FILE,
  CONVERSION_STACK_FILE,
  CONVERSION_ARCHITECTURE_FILE,
  CONVERSION_HARNESS_FILE,
  CONVERSION_TAXONOMY_FILE,
  CONVERSION_PURPOSE_FILE,
  CONVERSION_DESIGN_FILE,
  CONVERSION_ANALYSIS_FILE,
  CONVERSION_STORY_LIST_FILE,
  CONVERSION_FLOWS_FILE,
  CONVERSION_AREAS_FILE,
  CONVERSION_SCAFFOLD_FILE,
  CONVERSION_STRUCTURE_FILE,
  CONVERSION_ESTIMATE_FILE,
  CONVERSION_ASSUMPTIONS_FILE,
  CONVERSION_INQUIRIES_FILE,
  CONVERSION_DUMPS_FILE,
  CONVERSION_ORIGIN_CARD_FILE,
]

/** The memory nodes a conversion owns in the target's harness. */
export const CONVERSION_MEMORY: readonly string[] = [
  CONVERSION_MEMORY_FILE, CONVERSION_ORIGIN_MAP_FILE,
]

/**
 * Everything a conversion OWNS on the volume — the documents and the two memory nodes.
 *
 * One list, because two consumers must agree about it and each of them is a wipe: the relocation
 * keeps these at the root when it files the origin away, and the initialization one step later
 * must leave the same set alone. A conversion writes its taxonomy, its restored specification and
 * its per-story proofs BEFORE the target exists — the analysis is what decides there is a target
 * worth laying down — so a second, hand-kept copy of this list is a document that survives the
 * relocation and not the install, which is hours of model calls thrown away with nothing failing.
 */
export const CONVERSION_ARTIFACTS: readonly string[] = [
  CONVERSION_DIR, ...CONVERSION_MEMORY,
]

/** The frontmatter version every conversion document carries, so a reader can refuse an old one. */
export const CONVERSION_DOC_VERSION = 1

// --- budgets ------------------------------------------------------------------------------
//
// Every one of these bounds something an origin controls the size of. An origin is a repository a
// stranger wrote: it may hold a hundred thousand files, a gigabyte of exports, or one minified
// bundle. A pass with no ceiling is a pass whose cost and duration are set by the input rather
// than by the platform, which is how a conversion of a large monorepo becomes an unbounded bill.

/** Entries the census walks before it stops and reports itself truncated. */
export const CENSUS_MAX_ENTRIES = 20_000
/** Files the census opens. Everything else is classified from its path and its size alone. */
export const CENSUS_READ_FILES = 400
/** Total bytes the census reads across those files. */
export const CENSUS_READ_BYTES = 6_000_000
/** Bytes read from the head of one file — enough to classify it, never enough to hold it. */
export const CENSUS_HEAD_BYTES = 4096

/**
 * The most one `readHead` may allocate, whatever the caller asked for.
 *
 * A head is read to CLASSIFY a file — the census reads {@link CENSUS_HEAD_BYTES} of it, a dump
 * sample four times that — so a caller asking for megabytes has misunderstood the command rather
 * than needed them, and honouring it would allocate that much before the read, inside a slot pod
 * or on a developer's machine, for a file that may be shorter than the request.
 */
export const CENSUS_MAX_HEAD_BYTES = 1_048_576

/**
 * How much of a file is read to decide whether it is binary.
 *
 * Smaller than {@link CENSUS_HEAD_BYTES} because the question is smaller: a NUL byte near the
 * beginning, which is git's own heuristic and the one signal that separates bytes a model can be
 * handed from bytes that would arrive as replacement characters.
 */
export const BINARY_PROBE_BYTES = 512

/**
 * Directories a census walk never descends into.
 *
 * ONE constant, spread by the library-local helper, the publisher and the connector SDK executor,
 * because the three of them answer the SAME question about the same tree and a caller cannot tell
 * which one produced the listing it is holding — so a directory skipped by one and walked by
 * another means one repository has two different `total`s.
 *
 * Deliberately not {@link SOURCE_LIST_EXCLUSIONS}: a census is asked what the tree HOLDS, so it
 * reports the metadata and the converted origin that a coder's source listing hides. What it must
 * never walk is what a package manager or a build put there, and only `node_modules` and `.git`
 * are that in every repository — `dist`, `build` and `.next` are ordinary directory names an
 * origin may keep sources in, and skipping them silently subtracted files from the census of a
 * repository nobody here wrote.
 */
export const CENSUS_SKIP_DIRS: readonly string[] = ['node_modules', '.git']

/** The upper bounds of every {@link SizeClass} but `Huge`, which is everything above the last. */
export const SIZE_CLASS_BOUNDS: Record<Exclude<SizeClass, SizeClass.Huge>, number> = {
  [SizeClass.Tiny]: 2_048,
  [SizeClass.Small]: 32_768,
  [SizeClass.Medium]: 262_144,
  [SizeClass.Large]: 2_097_152,
}

/** Above this a data file is a {@link DumpKind.Bulk} export, never a seed the target carries. */
export const SEED_MAX_BYTES = 262_144
/** Bytes read from a dump to describe it. */
export const DUMP_SAMPLE_BYTES = 16_384
/** Lines of that sample kept in the document. */
export const DUMP_SAMPLE_LINES = 20
/** At or above this, a data file is reported as a bulk export even where its path looks like seed. */
export const BULK_DUMP_MIN_BYTES = 1_000_000
/** Distinct extensions reported in the inventory document. */
export const TOP_EXTENSIONS = 30

/** Files one taxonomy layer samples, and the characters those samples may total. */
export const TAXONOMY_SAMPLE_FILES = 60
export const TAXONOMY_SAMPLE_CHARS = 120_000

/**
 * The ceiling on the origin card — the standing description of the origin every coder prompt
 * carries once a conversion has produced one.
 *
 * It rides on EVERY generation call of the implementation stage, so its size is multiplied by the
 * number of calls a conversion makes. Enforced by truncation after the card is composed, never by
 * asking a model to obey a limit.
 */
export const ORIGIN_CARD_MAX_CHARS = 6000
/** The ceiling on one stack's skill pack, for the same reason. */
export const STACK_PACK_MAX_CHARS = 2400

/** The estimator's crude token conversion, and the input it assumes it reads of a source tree. */
export const CHARS_PER_TOKEN = 4
export const SOURCE_SAMPLE_RATIO = 0.35
/** What the estimator adds for the retries a model pass normally makes. */
export const RETRY_FACTOR = 1.15
export const ESTIMATE_VERSION = 1

/**
 * The per-story price band shown before the implementation stage starts.
 *
 * A BAND and not a number: a story's cost is set by how much code it turns out to need, which is
 * exactly what nothing knows before it is written. Shown with a disclaimer saying so.
 */
export const STORY_BAND_MIN_USD = 2
export const STORY_BAND_MAX_USD = 5

/** Below this, a purpose inference is reported as a guess and the user is asked to confirm it. */
export const PURPOSE_CONFIDENCE_FLOOR = 0.4

/**
 * The ceiling on an inquiry answer stored in a PIPELINE STATE.
 *
 * Pipeline state is keys, not content: a run's state is written back at every step boundary and a
 * couple of long free-text answers is all it takes to stop that being true. The answer's full text
 * goes to `docs/conversion/inquiries.md`, keyed by the inquiry id, and the state keeps a scalar.
 *
 * ONE ceiling for the whole stack, exactly as {@link CONNECT_INQUIRY_MAX_TEXT} is: the twin is
 * `INQUIRY_STATE_TEXT_CHARS` in `@owlmeans/llm-common`, and the two must stay equal. The runtime
 * truncates with its own copy and this package's documents are written against this one, so a
 * disagreement means a state saying one thing and the document beside it saying another.
 */
export const INQUIRY_STATE_TEXT_CHARS = 200

/** The ceiling on an error message recorded on the conversion record. */
export const CONVERSION_ERROR_CAP = 500
/** Assumptions kept on the conversion record; the rest live in `docs/conversion/assumptions.md`. */
export const CONVERSION_ASSUMPTION_CAP = 40

/**
 * How deep intake clones an origin repository.
 *
 * One commit. A conversion reads the tree as it is now and has no use for its history, and a full
 * clone of a long-lived repository is minutes of network and a volume's worth of pack files.
 */
export const CONVERT_CLONE_DEPTH = 1

/** The stages in order. The single source for {@link canEnter} and the stage ladder. */
export const CONVERSION_STAGE_ORDER: ConversionStage[] = [
  ConversionStage.Intake,
  ConversionStage.Analysis,
  ConversionStage.Extraction,
  ConversionStage.Implementation,
]

/**
 * The inquiry ids a conversion can ask under.
 *
 * Stable strings, because an answer is recorded against one and re-read on a resume: renaming an
 * id orphans every answer already given under it.
 */
export const CONVERSION_INQUIRY = {
  workspaceUnlinked: 'convert.workspace.unlinked',
  seedCarry: 'convert.seed.carry',
  verdictLimited: 'convert.verdict.limited',
  purposeConfirm: 'convert.purpose.confirm',
  caseConfirm: 'convert.case.confirm',
  areasMap: 'convert.areas.map',
  originRelocate: 'convert.origin.relocate',
} as const
