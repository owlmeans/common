import { DEFAULT_UPLOAD_POLICY, FileKind, type UploadPolicy } from '@owlmeans/upload'
import { SLOT_BINARY_MAX_BYTES } from '../slot/consts.js'
import type { MaterialsLimits } from './types.js'

/**
 * The files a person attaches to a NEW project's prompt — "materials" in code, "Files" in the UI.
 *
 * Declared here because four runtimes must agree about every name below: the browser that checks
 * the limits before an upload, the API service that enforces them and stores the catalogue rows,
 * the agent that analyses and places the files, and the publisher that serves the placed assets.
 */

/** What a file is FOR in the project — the slug a catalogue entry is classified with. */
export enum MaterialPurpose {
  /** A product description, a requirements document, a brief. */
  Specification = 'specification',
  BrandLogo = 'brand-logo',
  Icon = 'icon',
  Font = 'font',
  /** A stylesheet whose look the product should take. */
  CssExample = 'css-example',
  /** A wireframe, a drawing, a diagram of a screen or a flow. */
  LayoutSketch = 'layout-sketch',
  /** A page (or a bundle of pages) whose structure and look the product should follow. */
  HtmlPrototype = 'html-prototype',
  /** Code showing how something is computed — to be reimplemented, never run as is. */
  AlgorithmExample = 'algorithm-example',
  GraphicAsset = 'graphic-asset',
  VideoAsset = 'video-asset',
  AudioAsset = 'audio-asset',
  Model3d = 'model-3d',
  /** Hand notes — typed or photographed. */
  Notes = 'notes',
  Other = 'other',
}

/** Where one file stands. */
export enum MaterialStatus {
  /** Stored (agent tmp + bucket backup), not analysed yet. */
  Received = 'received',
  /** Analysed: purpose, description and details are set. */
  Catalogued = 'catalogued',
  /** Dropped by the agent — {@link MaterialRemoval} says why. */
  Removed = 'removed',
  /** Refused by the API on upload; no bytes were kept. */
  Rejected = 'rejected',
  /** Moved into the workload (`placedAt`). */
  Placed = 'placed',
}

/** Why a file was removed or rejected. */
export enum MaterialRemoval {
  /** The bytes are not what the name and the declared type say. */
  TypeMismatch = 'type-mismatch',
  /** Active content (scripts in a PDF or an SVG, macros) the platform will not keep. */
  Dangerous = 'dangerous',
  /** A program, a library or another compiled binary. */
  Executable = 'executable',
  /** Text that addresses the agent rather than describing the product. */
  PromptInjection = 'prompt-injection',
  /** Over the file count, the file size or the total size. */
  Limit = 'limit',
  /** An archive that could not be unpacked safely. */
  ArchiveInvalid = 'archive-invalid',
  /** A path that escapes the upload, or names a reserved place. */
  PathInvalid = 'path-invalid',
}

/** How a material came to be used for a {@link MaterialUseTarget}. */
export enum MaterialUseBy {
  /** The file's name said so (`logo.svg`). */
  Name = 'name',
  /** The prompt or another material cites it. */
  Reference = 'reference',
  /** The agent's own analysis of its content. */
  Analysis = 'analysis',
}

/**
 * The known places a material is used for.
 *
 * Known, not closed: `MaterialUse.target` is a string, because a newer agent may name a use an
 * older platform has never seen, and a catalogue row it cannot store is a file the person loses.
 */
export enum MaterialUseTarget {
  Logo = 'logo',
  Favicon = 'favicon',
  HeroImage = 'hero-image',
  HeroVideo = 'hero-video',
  BackgroundAudio = 'background-audio',
  SectionMedia = 'section-media',
  Font = 'font',
  Theme = 'theme',
  HomeStructure = 'home-structure',
  Architecture = 'architecture',
  Specification = 'specification',
  Example = 'example',
}

/** The statuses whose file is still part of the project — what a reader may use. */
export const MATERIAL_USABLE_STATUSES: readonly MaterialStatus[] = Object.freeze([
  MaterialStatus.Received, MaterialStatus.Catalogued, MaterialStatus.Placed,
])

/** The `@owlmeans/file-inspector` kinds whose bytes are text a reader may decode as UTF-8. */
export const MATERIAL_TEXT_KINDS: readonly string[] = Object.freeze(['text', 'code', 'html', 'csv', 'diagram'])

/** Media types that are text without saying `text/`. */
export const MATERIAL_TEXT_MIMES: readonly string[] = Object.freeze([
  'application/json', 'application/xml', 'image/svg+xml', 'application/javascript', 'application/vnd.jgraph.mxfile',
  'application/vnd.excalidraw+json', 'application/x-yaml', 'application/yaml',
])

/** Extensions whose bytes are text, for an entry the inspector named no text kind or type for. */
export const MATERIAL_TEXT_EXTENSIONS: readonly string[] = Object.freeze([
  'md', 'markdown', 'mdx', 'txt', 'text', 'rst', 'adoc', 'csv', 'tsv', 'json', 'yaml', 'yml', 'toml', 'xml',
  'html', 'htm', 'xhtml', 'svg', 'css', 'scss', 'sass', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py',
  'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'cs', 'php', 'swift', 'sql', 'sh', 'drawio', 'excalidraw',
])

/** Where the catalogue and the markdown analogues live in the target workload. */
export const MATERIALS_DIR = 'docs/materials'

/** The catalogue as a target document: a JSON frontmatter for machines, a table for people. */
export const MATERIALS_INDEX = `${MATERIALS_DIR}/index.md`

/** Where web assets taken from the materials are placed — served by the target's web package. */
export const MATERIALS_ASSETS_DIR = 'sources/web/public/assets'

/**
 * The purposes whose files are WEB ASSETS — placed under {@link MATERIALS_ASSETS_DIR} and served at
 * `/assets/<original path>`; every other material is placed under {@link MATERIALS_DIR}. The ONE set
 * the platform's placement at initialization and the library's asset plan both read: a purpose in one
 * list and not the other is a file planned at a URL nothing serves.
 */
export const MATERIALS_ASSET_PURPOSES: ReadonlySet<MaterialPurpose> = new Set([
  MaterialPurpose.BrandLogo, MaterialPurpose.Icon, MaterialPurpose.Font, MaterialPurpose.GraphicAsset,
  MaterialPurpose.VideoAsset, MaterialPurpose.AudioAsset, MaterialPurpose.Model3d,
])

/**
 * What a re-initialization keeps: both directories the materials are placed into.
 *
 * Spread into every wipe's keep list (the library's `initializeProject`, the platform's reinit) —
 * a placed material exists nowhere else once its storage scope is purged.
 */
export const MATERIALS_KEEP: readonly string[] = Object.freeze([MATERIALS_DIR, MATERIALS_ASSETS_DIR])

/**
 * Limits on the EXPANDED set (after archives are unpacked), checked in the browser and enforced by
 * the API. `fileBytes` IS the slot binary transport ceiling: a larger file could never be placed in
 * a workload nor read back from one.
 */
export const MATERIALS_LIMITS: Readonly<MaterialsLimits> = Object.freeze({
  files: 50,
  fileBytes: SLOT_BINARY_MAX_BYTES,
  totalBytes: 50 * 1024 * 1024,
})

/**
 * The upload policy of a NEW project's files, in every runtime that checks it — the browser's and a
 * connector's precheck (an archive counted as one file of its own size until it is unpacked) and the
 * API services' upload session (the same limits on the EXPANDED set): `MATERIALS_LIMITS`, archives
 * unpacked, executables refused.
 */
export const MATERIALS_UPLOAD_POLICY: Readonly<UploadPolicy> = Object.freeze({
  ...DEFAULT_UPLOAD_POLICY,
  maxFiles: MATERIALS_LIMITS.files,
  maxFileBytes: MATERIALS_LIMITS.fileBytes,
  maxTotalBytes: MATERIALS_LIMITS.totalBytes,
  unpackArchives: true,
  refuse: [FileKind.Executable],
})

/** The token budget of the materials brief (the prompt plus the specification texts). */
export const MATERIALS_BRIEF_TOKENS = 80_000

/** The `purpose` segment of a material storage scope: `<entitySlug>/<slotId>/new-project`. */
export const MATERIALS_SCOPE_PURPOSE = 'new-project'

/** The shape version of `docs/materials/index.md`'s frontmatter. */
export const MATERIALS_INDEX_VERSION = 1

/** String ceilings of a catalogue row — one value per field across the stack. */
export const MATERIAL_PATH_MAX = 1024
export const MATERIAL_NAME_MAX = 255
export const MATERIAL_DESCRIPTION_MAX = 4000
export const MATERIAL_NOTE_MAX = 1000
export const MATERIAL_USES_MAX = 32

/**
 * The record keys that belong to the PLATFORM — ids, the storage scope and the timestamps. A
 * catalogue entry in the target is the record without them.
 */
export const MATERIAL_PLATFORM_KEYS = Object.freeze([
  'id', 'projectId', 'entityId', 'slotId', 'scope', 'createdAt', 'updatedAt',
] as const)
