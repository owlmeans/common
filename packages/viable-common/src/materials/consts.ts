import { DEFAULT_UPLOAD_POLICY, FileKind, type UploadPolicy } from '@owlmeans/upload'
import { SLOT_BINARY_MAX_BYTES } from '../slot/consts.js'
import type { MaterialsLimits, MaterialsLinkLimits } from './types.js'

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

/*
 * References — what a person points at on the web instead of uploading it: links (pages, files,
 * public S3 objects and prefixes, public Drive folders), online research requests and npm packages.
 * Fetched files run through the same intake as uploaded ones; what the platform writes from them
 * lives under `docs/materials/` beside the catalogue.
 */

/** What a person wants from a link they gave. One link may carry several. */
export enum MaterialLinkIntent {
  /** A page to resemble — its look, structure and copy. */
  Design = 'design',
  /** A service to match by what it does. */
  Function = 'function',
  /** Text to use — a specification, copy, data. */
  Content = 'content',
  /** A file to use as is — a logo, an image, a font. */
  Asset = 'asset',
  /** A package to build with. */
  Package = 'package',
}

/** Where a reference was named: the prompt, the specification at confirmation, or a fetched link. */
export enum ReferenceOrigin {
  Prompt = 'prompt',
  Specification = 'specification',
  /** A package a fetched page named — packages only. */
  Link = 'link',
}

/** Where one link of `references.json` stands. */
export enum ReferenceLinkStatus {
  /** Admitted, not fetched yet. */
  Pending = 'pending',
  /** Its files are rows of the catalogue. */
  Fetched = 'fetched',
  /** Read for a summary or a style reference; its files were research sources. */
  Researched = 'researched',
  /** Not admitted — over a budget, a duplicate, nothing to fetch (`reason`). */
  Skipped = 'skipped',
  /** The content gate refused what it carried; its files were deleted. */
  Refused = 'refused',
  Failed = 'failed',
}

/** Where one online research request stands. */
export enum ReferenceResearchStatus {
  Pending = 'pending',
  Researched = 'researched',
  Skipped = 'skipped',
  Failed = 'failed',
}

/** What the package check concluded about a named package. */
export enum ReferencePackageVerdict {
  Genuine = 'genuine',
  /** A lookalike, security-holding, deprecated or otherwise untrustworthy package — never installed. */
  Suspicious = 'suspicious',
  /** Not enough evidence either way — never installed. */
  Unknown = 'unknown',
}

/** Where one named package stands. */
export enum ReferencePackageStatus {
  Pending = 'pending',
  /** Checked and genuine. */
  Verified = 'verified',
  /** Suspicious or unknown — never installed (`reason`, `reasons`). */
  Refused = 'refused',
  /** A skill was written for it (`skill`). */
  Skilled = 'skilled',
  Failed = 'failed',
}

/** What a generated document under `docs/materials/` is — the index's generated-documents section. */
export enum MaterialGeneratedKind {
  /** An online research report (`research/<slug>.md`). */
  Research = 'research',
  /** A functional summary of a service a link pointed at (`references/<slug>/summary.md`). */
  ReferenceSummary = 'reference-summary',
  /** A style reference read from a third-party page (`references/<slug>/design.md`), marks excluded. */
  ReferenceDesign = 'reference-design',
  /** A package skill (`skills/<name>/SKILL.md`). */
  Skill = 'skill',
}

/**
 * The budget of the references of ONE project, the prompt and the confirmed specification together:
 * links (a folder counts as one), the files fetched for them and their bytes, research requests,
 * opened results per request and package skills. `fileBytes` IS the slot binary ceiling, like the
 * uploads': a larger file could never be placed in a workload.
 */
export const MATERIALS_LINK_LIMITS: Readonly<MaterialsLinkLimits> = Object.freeze({
  links: 10,
  files: 100,
  fileBytes: SLOT_BINARY_MAX_BYTES,
  totalBytes: 100 * 1024 * 1024,
  research: 3,
  researchResults: 5,
  skills: 5,
})

/**
 * The upload policy every fetched file passes before it becomes a row — the same intake as an
 * upload, with the link budget's file limits: archives unpacked, executables refused.
 */
export const MATERIALS_LINK_POLICY: Readonly<UploadPolicy> = Object.freeze({
  ...DEFAULT_UPLOAD_POLICY,
  maxFiles: MATERIALS_LINK_LIMITS.files,
  maxFileBytes: MATERIALS_LINK_LIMITS.fileBytes,
  maxTotalBytes: MATERIALS_LINK_LIMITS.totalBytes,
  unpackArchives: true,
  refuse: [FileKind.Executable],
})

/**
 * The reserved top-level segment of fetched files in a materials scope: `links/<nn>-<slug>/…`, the
 * remote names kept below. Reserved in both receivers — an upload can never land under it, so a
 * fetched file can never replace an uploaded one.
 */
export const MATERIALS_LINKS_PREFIX = 'links'

/**
 * The `purpose` segment of the transient research scope `<entitySlug>/<slotId>/research` — research
 * sources, claimed with the materials scope, stored on the slot, dropped once their documents exist.
 */
export const MATERIALS_RESEARCH_PURPOSE = 'research'

/** The references ledger, under {@link MATERIALS_DIR}. */
export const MATERIALS_REFERENCES_DOC = 'references.json'

/** The references ledger's workload path. */
export const MATERIALS_REFERENCES = `${MATERIALS_DIR}/${MATERIALS_REFERENCES_DOC}`

/** Research reports, under {@link MATERIALS_DIR}: `research/<slug>.md`. */
export const MATERIALS_RESEARCH_DIR = 'research'

/** Per-link documents, under {@link MATERIALS_DIR}: `references/<slug>/summary.md` | `design.md`. */
export const MATERIALS_REFERENCE_DIR = 'references'

/** A link's functional summary, inside its {@link MATERIALS_REFERENCE_DIR} folder. */
export const MATERIALS_REFERENCE_SUMMARY = 'summary.md'

/** A link's style reference, inside its {@link MATERIALS_REFERENCE_DIR} folder. */
export const MATERIALS_REFERENCE_DESIGN = 'design.md'

/** Package skills, under {@link MATERIALS_DIR}: `skills/<name>/SKILL.md`. */
export const MATERIALS_SKILLS_DIR = 'skills'

/** A skill's file name. */
export const MATERIALS_SKILL_FILE = 'SKILL.md'

/** Where a workload's own harness reads skills. */
export const MATERIALS_WORKLOAD_SKILLS_DIR = '.agents/skills'

/** The prefix of a package skill's workload copy: `.agents/skills/pkg-<name>/`. */
export const MATERIALS_SKILL_PREFIX = 'pkg-'

/** A skill name's ceiling, the prefix included (the agent-skills rule): `<name>` gets the rest. */
export const MATERIAL_SKILL_NAME_MAX = 64

/** A link slug's ceiling — a folder `<nn>-<slug>` stays far inside a storage segment's 128. */
export const MATERIAL_LINK_SLUG_MAX = 48

/** A URL's ceiling — a longer one is not a link the platform follows. */
export const MATERIAL_LINK_URL_MAX = 2048

/** An npm package name's ceiling. */
export const REFERENCE_PACKAGE_NAME_MAX = 214

/** Rows a ledger keeps per list — skipped links are recorded too, with their reason. */
export const REFERENCE_LINKS_MAX = 100
export const REFERENCE_RESEARCH_MAX = 20
export const REFERENCE_PACKAGES_MAX = 50

/** The origins a link or a research request may have — only a package may come from a fetched link. */
export const REFERENCE_ASKED_ORIGINS: readonly ReferenceOrigin[] = Object.freeze([
  ReferenceOrigin.Prompt, ReferenceOrigin.Specification,
])

/** The link statuses that take one of the {@link MATERIALS_LINK_LIMITS} `links`. */
export const REFERENCE_LINK_ADMITTED: readonly ReferenceLinkStatus[] = Object.freeze([
  ReferenceLinkStatus.Pending, ReferenceLinkStatus.Fetched, ReferenceLinkStatus.Researched,
])

/** The research statuses that take one of the {@link MATERIALS_LINK_LIMITS} `research`. */
export const REFERENCE_RESEARCH_ADMITTED: readonly ReferenceResearchStatus[] = Object.freeze([
  ReferenceResearchStatus.Pending, ReferenceResearchStatus.Researched,
])

/** The shape version of `docs/materials/references.json`. */
export const REFERENCES_VERSION = 1
