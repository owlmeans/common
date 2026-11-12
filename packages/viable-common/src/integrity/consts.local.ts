/** Root-level files protected in every layout. */
export const ROOT_PROTECTED = ['package.json', 'bunfig.toml', 'bun.lock', 'index.js'] as const

/** The harness files, protected in every layout — see {@link TARGET_PROTECTED_FILES}. */
export const HARNESS_PROTECTED = ['.claude/settings.json', '.agents/scripts/link-skills.sh'] as const

/** The files of a bundled package no user-facing write may touch — an extra app's packages too. */
export const BUNDLE_PROTECTED = ['package.json', 'tsconfig.json', 'rollup.config.js', 'rollup.build.mjs'] as const
