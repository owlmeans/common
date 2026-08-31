import { DEFAULT_SKILL_ORDER, PromptBlock } from '@owlmeans/llm-common'
import type { SkillDefinition } from '@owlmeans/llm-common'
import type { Manifest, ManifestEntry } from '../discover.js'

/** `@owlmeans/foo` → `foo`; the repo lays packages out under their unscoped name. */
export const unscoped = (packageName: string): string =>
  packageName.slice(packageName.indexOf('/') + 1)

export const parseManifest = (raw: string): Manifest | null => {
  try {
    const manifest = JSON.parse(raw) as Manifest
    if (typeof manifest.schemaVersion !== 'number' || !Array.isArray(manifest.entries)) {
      return null
    }
    return manifest
  } catch {
    return null
  }
}

const BANNER = /^<!--\s*AUTO-GENERATED[^>]*-->\s*/

/**
 * Strip the YAML frontmatter and the generated-file banner from an embedded SKILL.md.
 *
 * Both are installer bookkeeping — `name`, `description`, `applyTo`, "do not edit". Sent
 * to a model they are pure noise in the most expensive part of the prompt, and the
 * "do not edit" line actively misleads it about what it is being shown.
 */
export const stripMeta = (content: string): string => {
  let body = content.replace(/^﻿/, '')
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3)
    if (end >= 0) {
      const after = body.indexOf('\n', end + 1)
      body = after >= 0 ? body.slice(after + 1) : ''
    }
  }

  return body.replace(BANNER, '').trim()
}

/**
 * Skill entries worth loading, in a deterministic order.
 *
 * Instruction entries appear only in manifests published before schema v2 and are
 * dropped: they are the Copilot twin of the same knowledge, so including both would
 * double the token cost of every package for no added information.
 */
export const skillEntries = (
  manifest: Manifest,
  categories: readonly string[],
): ManifestEntry[] =>
  manifest.entries
    .filter(entry => entry.kind === 'skill' && categories.includes(entry.category))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/**
 * Turn one embedded skill file into a definition bound to the `Packages` block.
 *
 * The alias is namespaced by package so two packages documenting the same concept cannot
 * collide in the registry, and the order weight is pushed past the default so package
 * knowledge always renders after whatever the host declared itself.
 */
export const toSkill = (
  packageName: string,
  entry: ManifestEntry,
  body: string,
): SkillDefinition => ({
  alias: `${packageName}#${entry.name}`,
  title: `${packageName} — ${entry.name}`,
  body,
  block: PromptBlock.Packages,
  order: DEFAULT_SKILL_ORDER + 1,
})
