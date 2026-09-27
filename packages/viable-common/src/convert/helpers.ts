import {
  ArchitectureCase, ConversionDecision, ConversionStage, CONVERSION_STAGE_ORDER,
  CONVERTED_ORIGIN_DIR, EntropyClass, FileClass, ORIGIN_CARD_MAX_CHARS, SizeClass,
  SIZE_CLASS_BOUNDS
} from './consts.js'
import type { OriginCard, StoryProof } from './types.js'

/**
 * Pure, deterministic derivations over the conversion vocabulary.
 *
 * Everything here answers the same way for the same input, in every runtime, forever — which is
 * what makes the documents a conversion writes byte-stable across two runs, and therefore what
 * makes the prompt cache prefix they are injected into actually hit. Nothing in this file reads a
 * file, calls a model or looks at a clock.
 */

/** Which {@link SizeClass} a byte count falls in. Boundaries are exclusive upper bounds. */
export const sizeClassOf = (bytes: number): SizeClass => {
  if (bytes < SIZE_CLASS_BOUNDS[SizeClass.Tiny]) return SizeClass.Tiny
  if (bytes < SIZE_CLASS_BOUNDS[SizeClass.Small]) return SizeClass.Small
  if (bytes < SIZE_CLASS_BOUNDS[SizeClass.Medium]) return SizeClass.Medium
  if (bytes < SIZE_CLASS_BOUNDS[SizeClass.Large]) return SizeClass.Large

  return SizeClass.Huge
}

/**
 * Extension → class, for the extensions that decide a file on their own.
 *
 * Deliberately not exhaustive: a path rule below overrides it wherever the location says more than
 * the tail does (a `.ts` under `tests/` is a test, a `.json` under `seed/` is data).
 */
const EXT_CLASS: Record<string, FileClass> = {
  ts: FileClass.Source, tsx: FileClass.Source, js: FileClass.Source, jsx: FileClass.Source,
  mjs: FileClass.Source, cjs: FileClass.Source, mts: FileClass.Source, cts: FileClass.Source,
  vue: FileClass.Source, svelte: FileClass.Source, java: FileClass.Source, kt: FileClass.Source,
  kts: FileClass.Source, go: FileClass.Source, py: FileClass.Source, rb: FileClass.Source,
  php: FileClass.Source, cs: FileClass.Source, ex: FileClass.Source, exs: FileClass.Source,
  rs: FileClass.Source, sql: FileClass.Source, sh: FileClass.Source,

  css: FileClass.Style, scss: FileClass.Style, sass: FileClass.Style, less: FileClass.Style,
  styl: FileClass.Style,

  md: FileClass.Doc, mdx: FileClass.Doc, rst: FileClass.Doc, adoc: FileClass.Doc,
  txt: FileClass.Doc,

  json: FileClass.Config, yaml: FileClass.Config, yml: FileClass.Config, toml: FileClass.Config,
  ini: FileClass.Config, env: FileClass.Config, properties: FileClass.Config,
  xml: FileClass.Config, conf: FileClass.Config,

  html: FileClass.Template, htm: FileClass.Template, hbs: FileClass.Template,
  ejs: FileClass.Template, pug: FileClass.Template, twig: FileClass.Template,
  erb: FileClass.Template, jinja: FileClass.Template, j2: FileClass.Template,

  csv: FileClass.Data, tsv: FileClass.Data, ndjson: FileClass.Data, jsonl: FileClass.Data,
  parquet: FileClass.Data, dump: FileClass.Data,

  png: FileClass.Binary, jpg: FileClass.Binary, jpeg: FileClass.Binary, gif: FileClass.Binary,
  webp: FileClass.Binary, ico: FileClass.Binary, pdf: FileClass.Binary, zip: FileClass.Binary,
  gz: FileClass.Binary, tar: FileClass.Binary, woff: FileClass.Binary, woff2: FileClass.Binary,
  ttf: FileClass.Binary, otf: FileClass.Binary, mp4: FileClass.Binary, mp3: FileClass.Binary,
  wasm: FileClass.Binary, jar: FileClass.Binary, so: FileClass.Binary, dll: FileClass.Binary,
}

/** Exact basenames that are a package manifest whatever their extension says. */
const MANIFEST_NAMES = [
  'package.json', 'deno.json', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'settings.gradle', 'settings.gradle.kts', 'go.mod', 'cargo.toml', 'pyproject.toml',
  'requirements.txt', 'pipfile', 'composer.json', 'gemfile', 'mix.exs',
]

/** Exact basenames that are a lockfile — never read, never counted as source. */
const LOCK_NAMES = [
  'bun.lock', 'bun.lockb', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'go.sum',
  'cargo.lock', 'composer.lock', 'gemfile.lock', 'poetry.lock', 'pipfile.lock', 'mix.lock',
]

/**
 * Path segments whose contents are produced by a build and say nothing about the application.
 *
 * `bin` is deliberately absent though `obj` is here: it is .NET/Java output in two of the nine
 * ecosystems the converter reads and a real entrypoint directory in the rest (`bin/cli.ts`,
 * `bin/console`, `bin/rails`), and this function is handed one path with no tree around it to
 * tell the two apart. Dropping those entrypoints out of every source listing is the worse error.
 */
const GENERATED_SEGMENTS = [
  'node_modules', 'dist', 'build', 'out', 'target', 'vendor', '.next', '.nuxt', '.svelte-kit',
  '.turbo', '.gradle', '__pycache__', 'coverage', '.venv', 'obj',
]

/** Path segments that make a file a test wherever its extension would have said otherwise. */
const TEST_SEGMENTS = ['test', 'tests', '__tests__', 'spec', 'specs', 'e2e']

const segmentsOf = (path: string): string[] => path.split('/').filter(part => part !== '')

const hasSegment = (path: string, of: string[]): boolean =>
  segmentsOf(path).some(part => of.includes(part.toLowerCase()))

/**
 * The classes a seed or dump LOCATION is allowed to override.
 *
 * A seed directory says what a file holds, not what language it is written in — so it reclassifies
 * a payload and never a program. `seed/users.json` is data; `src/seedUsers.ts` is the code that
 * loads it, and `src/exportReport.ts` is a screen, and pushing either into the data budget takes
 * real source out of the census's reach.
 */
const DATA_OVERRIDABLE: FileClass[] = [
  FileClass.Data, FileClass.Config, FileClass.Binary, FileClass.Unknown,
]

/**
 * The extensions that are as often a dump as they are a program.
 *
 * A `.sql` under `migrations/` is schema somebody wrote and a coder has to reproduce; the same
 * tail under `dumps/` is an export nothing should read into a prompt. The location is the only
 * thing that separates them, so it outranks the tail for these and for no other language.
 */
const DATA_AMBIGUOUS_EXT = ['sql']

/**
 * What one file of the origin is.
 *
 * Location outranks the tail wherever it says more — a `.ts` under `__tests__/` is a test, a
 * `.json` under `seed/` is data — but only where it says more. The seed/dump rule therefore runs
 * AFTER the extension table and applies only to {@link DATA_OVERRIDABLE}: asked first, it answered
 * `Data` for every path merely containing the word (`tests/fixtures/user.ts`, `src/seedUsers.ts`,
 * `src/exportReport.ts`), which is the census's source budget spent on the wrong files twice over.
 */
export const fileClassOf = (path: string, ext: string): FileClass => {
  const lower = path.toLowerCase()
  const base = segmentsOf(lower).pop() ?? lower
  const tail = (ext.startsWith('.') ? ext.slice(1) : ext).toLowerCase()

  if (LOCK_NAMES.includes(base)) return FileClass.Lock
  if (hasSegment(lower, GENERATED_SEGMENTS)) return FileClass.Generated
  if (MANIFEST_NAMES.includes(base)) return FileClass.Manifest
  if (hasSegment(lower, TEST_SEGMENTS) || base.includes('.test.') || base.includes('.spec.')) {
    return FileClass.Test
  }
  if (base.startsWith('.env')) return FileClass.Config

  const byExt = EXT_CLASS[tail] ?? FileClass.Unknown
  if (
    (DATA_OVERRIDABLE.includes(byExt) || DATA_AMBIGUOUS_EXT.includes(tail))
    && (isSeedPath(lower) || isBulkPath(lower))
  ) {
    return FileClass.Data
  }

  return byExt
}

/**
 * Extensions whose tail already answers the binary question, either way.
 *
 * Deliberately two lists and not one with a default: an extension the census has never seen must
 * be READ rather than guessed at, because a repository nobody here wrote carries tails nobody
 * here chose. Nothing in either list is a guess about content — a `.ts` holding a NUL byte is a
 * corrupt file, and a `.png` that is not binary is not a `.png`.
 */
const TEXT_EXTENSIONS: readonly string[] = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json', '.jsonc',
  '.md', '.mdx', '.txt', '.css', '.scss', '.sass', '.less', '.html', '.htm', '.xml', '.svg',
  '.yml', '.yaml', '.toml', '.ini', '.env', '.sh', '.bash', '.zsh', '.sql', '.graphql', '.gql',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.php', '.cs', '.c', '.h', '.cpp', '.hpp', '.swift',
  '.vue', '.svelte', '.astro', '.lock', '.csv',
]

const BINARY_EXTENSIONS: readonly string[] = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.icns', '.tiff',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.mov', '.avi',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.tar',
  '.wasm', '.node', '.so', '.dylib', '.dll', '.exe', '.bin', '.class', '.jar',
  '.db', '.sqlite', '.sqlite3',
]

/**
 * The binary verdict a path already carries, or `null` for a file that has to be probed.
 *
 * The three executors that walk a tree — the library-local helper, the publisher and the connector
 * SDK — must answer the same verdict for the same file, and a probe alone does not: a small `.ico`
 * with no NUL in its first bytes reads as text, so a census run on a laptop and the same census
 * run in the slot disagreed about the same repository. The tail is asked first and the probe only
 * where the tail says nothing, which is also why the probe is affordable at census scale — the
 * extensions above are the bulk of any repository.
 *
 * The extension is taken exactly the way `path.extname` takes it, because two of the three callers
 * used to: the last dot of the last SEGMENT, and nothing for a name with no dot or for a dotfile.
 */
export const binaryByExtension = (path: string): boolean | null => {
  const base = segmentsOf(path).pop() ?? path
  const dot = base.lastIndexOf('.')
  if (dot < 1) return null
  const ext = base.slice(dot).toLowerCase()

  return TEXT_EXTENSIONS.includes(ext) ? false : BINARY_EXTENSIONS.includes(ext) ? true : null
}

/**
 * How usable a file's head is as evidence.
 *
 * The printable ratio over the sampled head, and nothing cleverer: the question is only whether a
 * model can read it. A minified bundle is printable and useless, so a second rule catches the
 * shape that gives it away — very long lines with almost no whitespace.
 */
export const entropyClassOf = (head: string): EntropyClass => {
  if (head.length < 1) return EntropyClass.Text

  let printable = 0
  let whitespace = 0
  for (const char of head) {
    const code = char.codePointAt(0) ?? 0
    if (code === 9 || code === 10 || code === 13 || code === 32) {
      ++whitespace
      ++printable
    } else if (code >= 32 && code !== 127) {
      ++printable
    }
  }

  const ratio = printable / head.length
  if (ratio < 0.85) return EntropyClass.Opaque
  // Prose, code and markup all break lines and indent. A body that does neither is minified,
  // encoded or packed — printable, and not something a model can reason over.
  if (whitespace / head.length < 0.05) return EntropyClass.Dense

  return EntropyClass.Text
}

/** Path segments and name fragments that mark bulk data — an export, not the app's own data. */
const BULK_HINTS = ['dump', 'dumps', 'export', 'exports', 'backup', 'backups', 'snapshot', 'archive']

/** Path segments that mark seed data — what the application needs in order to make sense. */
const SEED_HINTS = ['seed', 'seeds', 'fixture', 'fixtures', 'sample', 'samples', 'demo-data']

const matchesHint = (path: string, hints: string[]): boolean => {
  const lower = path.toLowerCase()
  if (hasSegment(lower, hints)) return true
  const base = segmentsOf(lower).pop() ?? lower

  return hints.some(hint => base.includes(hint))
}

export const isBulkPath = (path: string): boolean => matchesHint(path, BULK_HINTS)

export const isSeedPath = (path: string): boolean => matchesHint(path, SEED_HINTS)

/**
 * How much work re-implementing a story is, as a multiplier on the per-story price band.
 *
 * Derived from what the extraction found, never asked of a model: a story backed by a handful of
 * proofs and no algorithm is ordinary CRUD, one that carries described algorithms is business
 * logic somebody has to reproduce. Two runs over the same extraction therefore price identically,
 * which is the point — a band that moved between two viewings of the same screen would be noise.
 */
export const storyComplexity = (proof: Pick<StoryProof, 'proofs' | 'algorithms'>): number => {
  const proofs = proof.proofs?.length ?? 0
  const algorithms = proof.algorithms?.length ?? 0

  if (algorithms > 1 || proofs > 8) return 2
  if (algorithms > 0 || proofs > 3) return 1.5

  return 1
}

/**
 * The stage after this one.
 *
 * The last stage answers with itself: there is nothing after implementation, and returning
 * `undefined` would only move the same check to every call site.
 */
export const stageAfter = (stage: ConversionStage): ConversionStage => {
  const at = CONVERSION_STAGE_ORDER.indexOf(stage)

  return CONVERSION_STAGE_ORDER[at + 1] ?? stage
}

/**
 * The decision that ADVANCES out of a stage.
 *
 * Implementation's is {@link ConversionDecision.Leave}, because a finished conversion has nothing
 * further to run and leaving it as it stands is the ordinary outcome rather than an abandonment.
 */
export const decisionFor = (stage: ConversionStage): ConversionDecision => {
  switch (stage) {
    case ConversionStage.Intake: return ConversionDecision.Analyze
    case ConversionStage.Analysis: return ConversionDecision.Extract
    case ConversionStage.Extraction: return ConversionDecision.Implement
    default: return ConversionDecision.Leave
  }
}

/**
 * Whether a conversion at `from` may enter `to`.
 *
 * The same stage is legal — that is a retry. The next one is legal. Nothing else is: every stage
 * reads the documents the stage before it wrote, so skipping one means running against documents
 * that were never produced, and going back means overwriting the record a later stage is built on.
 */
export const canEnter = (from: ConversionStage, to: ConversionStage): boolean => {
  const at = CONVERSION_STAGE_ORDER.indexOf(from)
  const next = CONVERSION_STAGE_ORDER.indexOf(to)
  if (at < 0 || next < 0) return false

  return next === at || next === at + 1
}

/** The size of the rendered origin card, so a composer can trim before it exceeds its ceiling. */
export const originCardChars = (card: OriginCard): number => [
  card.stack as string,
  card.case as ArchitectureCase as string,
  card.purpose,
  ...card.packages,
  ...card.entities,
  ...card.flows,
  ...card.conventions,
].reduce((total, part) => total + (part?.length ?? 0), 0)

/** Whether a rendered card still fits the budget every coder prompt carries it in. */
export const originCardFits = (card: OriginCard): boolean =>
  originCardChars(card) <= ORIGIN_CARD_MAX_CHARS

/** Whether a target-relative path names the origin tree, or something inside it. */
export const isOriginPath = (path: string): boolean =>
  path === CONVERTED_ORIGIN_DIR || path.startsWith(`${CONVERTED_ORIGIN_DIR}/`)

/**
 * A path inside the origin tree, from a path relative to the origin's own root.
 *
 * Idempotent: a path already under the origin comes back unchanged, so a caller that has lost
 * track of which side of the move it holds cannot produce `__viable_converted/__viable_converted/`.
 */
export const originPath = (relative: string): string => {
  const path = relative.replace(/^\/+/, '')
  if (path === '') return CONVERTED_ORIGIN_DIR
  if (isOriginPath(path)) return path

  return `${CONVERTED_ORIGIN_DIR}/${path}`
}
