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
