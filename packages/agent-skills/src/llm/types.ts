import type { FileProviderRef, SkillDefinition } from '@owlmeans/llm-common'

/** The default scope the plugin looks for in a prompt. */
export const OWLMEANS_SCOPE = '@owlmeans'

/** Where a package's skills came from — surfaced in logs, useful when a lookup surprises you. */
export type SkillSource = 'files' | 'local' | 'remote'

export interface PackageSkills {
  packageName: string
  version: string
  source: SkillSource
  skills: SkillDefinition[]
}

export interface PackageSkillsOptions {
  /**
   * Host file access, tried FIRST. It reads the consuming project's own tree, so it is
   * the only path that works when the project lives somewhere this process cannot reach
   * directly — a sandbox, a remote workspace, a container.
   */
  files?: FileProviderRef

  /** Package scopes to detect. Defaults to `['@owlmeans']`. */
  scopes?: string[]

  /**
   * Directory the local `node_modules` lookup starts from, walking upward.
   * Defaults to `process.cwd()`.
   */
  dir?: string

  /** GitHub `owner/repo` holding the canonical packages. Defaults to `owlmeans/common`. */
  repo?: string

  /**
   * Git ref to read the embedded copies from. Defaults to `main`.
   *
   * The manifest deliberately carries no ref of its own — version-matching is guaranteed
   * by shipping the copy inside the tarball, so there is nothing to pin against for a
   * package that is NOT installed. Set this to a tag when reproducibility matters more
   * than freshness.
   */
  ref?: string

  /** Set to `false` to skip the GitHub fallback entirely (air-gapped runs). */
  fetch?: boolean

  /** Milliseconds before a remote lookup is abandoned. Defaults to 5000. */
  timeout?: number

  /**
   * Packages to ignore — typically the ones whose skills the static `Skills` block
   * already carries, so they are not paid for twice.
   */
  exclude?: string[]

  /**
   * Ceiling on how many mentioned packages are loaded into one prompt. Defaults to 5.
   * A prompt that name-drops a dozen packages is usually not asking about all of them,
   * and every one of them costs context.
   */
  maxPackages?: number

  /**
   * Manifest categories to include. Defaults to package knowledge only — `general`
   * entries describe how an agent should behave, not what a package does, and belong in
   * the host's own skill catalogue rather than in a package lookup.
   */
  categories?: Array<'package-specific' | 'multi-package' | 'general'>
}
