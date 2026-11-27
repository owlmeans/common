/** Root-level files protected in every layout. */
export const ROOT_PROTECTED = ['package.json', 'bunfig.toml', 'bun.lock', 'index.js'] as const

/** The harness files, protected in every layout — see {@link TARGET_PROTECTED_FILES}. */
export const HARNESS_PROTECTED = ['.claude/settings.json', '.agents/scripts/link-skills.sh'] as const

/** The files of a bundled package no user-facing write may touch — an extra app's packages too. */
export const BUNDLE_PROTECTED = ['package.json', 'tsconfig.json', 'rollup.config.js', 'rollup.build.mjs'] as const

/** The files of a library no user-facing write may touch — a structure's library parts. */
export const LIBRARY_PROTECTED = ['package.json', 'tsconfig.json'] as const

/** The files a structure's library part always has — what its stamp writes and its `tsc -b` builds from. */
export const PART_LIBRARY_FILES = ['package.json', 'tsconfig.json', 'src/index.ts'] as const

/** The dependency fields `bun install` links a `workspace:` sibling from. */
export const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const

/** The protocol a sibling dependency is declared with. */
export const WORKSPACE_PROTOCOL = 'workspace:'
