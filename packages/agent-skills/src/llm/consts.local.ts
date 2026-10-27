export const BANNER = /^<!--\s*AUTO-GENERATED[^>]*-->\s*/

export const DEFAULT_MAX_PACKAGES = 5

export const DEFAULT_CATEGORIES = ['package-specific', 'multi-package'] as const

export const AGENT_META = 'agent-meta'

export const MANIFEST = 'manifest.json'

export const DEFAULT_REPO = 'owlmeans/common'

export const DEFAULT_REF = 'main'

export const DEFAULT_TIMEOUT = 5000

/** What a package directory may be named — never a path that climbs out of `packages/`. */
export const PACKAGE_DIR = /^[a-z0-9][a-z0-9._-]*$/

/** Directory, beside an embedded `SKILL.md`, that holds the skill's parts. */
export const PARTS_DIR = 'parts'

/** What a part may be named — its file stem; nothing that could climb out of `parts/`. */
export const PART_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/** The first manifest schema whose skill entries may carry `parts`. */
export const PARTS_SCHEMA_VERSION = 3

/** Late packages loaded into the Tail in focus mode — see `PackageSkillsOptions.lateMaxPackages`. */
export const DEFAULT_LATE_MAX_PACKAGES = 3

/** Late packages' char ceiling in focus mode — see `PackageSkillsOptions.lateMaxChars`. */
export const DEFAULT_LATE_MAX_CHARS = 24_000
