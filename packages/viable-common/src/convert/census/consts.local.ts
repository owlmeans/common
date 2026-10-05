import { FileClass } from '../consts.js'

/**
 * Extension → class, for the extensions that decide a file on their own.
 *
 * Deliberately not exhaustive: a path rule below overrides it wherever the location says more than
 * the tail does (a `.ts` under `tests/` is a test, a `.json` under `seed/` is data).
 */
export const EXT_CLASS: Record<string, FileClass> = {
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
export const MANIFEST_NAMES = [
  'package.json', 'deno.json', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'settings.gradle', 'settings.gradle.kts', 'go.mod', 'cargo.toml', 'pyproject.toml',
  'requirements.txt', 'pipfile', 'composer.json', 'gemfile', 'mix.exs',
]

/** Exact basenames that are a lockfile — never read, never counted as source. */
export const LOCK_NAMES = [
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
export const GENERATED_SEGMENTS = [
  'node_modules', 'dist', 'build', 'out', 'target', 'vendor', '.next', '.nuxt', '.svelte-kit',
  '.turbo', '.gradle', '__pycache__', 'coverage', '.venv', 'obj',
]

/** Path segments that make a file a test wherever its extension would have said otherwise. */
export const TEST_SEGMENTS = ['test', 'tests', '__tests__', 'spec', 'specs', 'e2e']

/**
 * The classes a seed or dump LOCATION is allowed to override.
 *
 * A seed directory says what a file holds, not what language it is written in — so it reclassifies
 * a payload and never a program. `seed/users.json` is data; `src/seedUsers.ts` is the code that
 * loads it, and `src/exportReport.ts` is a screen, and pushing either into the data budget takes
 * real source out of the census's reach.
 */
export const DATA_OVERRIDABLE: FileClass[] = [
  FileClass.Data, FileClass.Config, FileClass.Binary, FileClass.Unknown,
]

/**
 * The extensions that are as often a dump as they are a program.
 *
 * A `.sql` under `migrations/` is schema somebody wrote and a coder has to reproduce; the same
 * tail under `dumps/` is an export nothing should read into a prompt. The location is the only
 * thing that separates them, so it outranks the tail for these and for no other language.
 */
export const DATA_AMBIGUOUS_EXT = ['sql']

/**
 * Extensions whose tail already answers the binary question, either way.
 *
 * Deliberately two lists and not one with a default: an extension the census has never seen must
 * be READ rather than guessed at, because a repository nobody here wrote carries tails nobody
 * here chose. Nothing in either list is a guess about content — a `.ts` holding a NUL byte is a
 * corrupt file, and a `.png` that is not binary is not a `.png`.
 */
export const TEXT_EXTENSIONS: readonly string[] = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json', '.jsonc',
  '.md', '.mdx', '.txt', '.css', '.scss', '.sass', '.less', '.html', '.htm', '.xml', '.svg',
  '.yml', '.yaml', '.toml', '.ini', '.env', '.sh', '.bash', '.zsh', '.sql', '.graphql', '.gql',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.php', '.cs', '.c', '.h', '.cpp', '.hpp', '.swift',
  '.vue', '.svelte', '.astro', '.lock', '.csv',
]

export const BINARY_EXTENSIONS: readonly string[] = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.icns', '.tiff',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.mov', '.avi',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.tar',
  '.wasm', '.node', '.so', '.dylib', '.dll', '.exe', '.bin', '.class', '.jar',
  '.db', '.sqlite', '.sqlite3',
]

/** Path segments and name fragments that mark bulk data — an export, not the app's own data. */
export const BULK_HINTS = ['dump', 'dumps', 'export', 'exports', 'backup', 'backups', 'snapshot', 'archive']

/** Path segments that mark seed data — what the application needs in order to make sense. */
export const SEED_HINTS = ['seed', 'seeds', 'fixture', 'fixtures', 'sample', 'samples', 'demo-data']
