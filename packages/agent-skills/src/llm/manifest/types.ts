import type { SkillDefinition } from '@owlmeans/llm-common'
import type { Manifest, ManifestEntry } from '../../types.js'

/** Reading an embedded `agent-meta/` manifest and its skill files into prompt skills. */
export interface ManifestHelper {
  /** `@owlmeans/foo` → `foo`; the repo lays packages out under their unscoped name. */
  unscoped: (packageName: string) => string
  /** A manifest read from its JSON text, or `null` when it is broken or not a manifest. */
  parseManifest: (raw: string) => Manifest | null
  /**
   * Strip the YAML frontmatter and the generated-file banner from an embedded SKILL.md.
   *
   * Both are installer bookkeeping — `name`, `description`, `applyTo`, "do not edit". Sent
   * to a model they are pure noise in the most expensive part of the prompt, and the
   * "do not edit" line actively misleads it about what it is being shown.
   */
  stripMeta: (content: string) => string
  /**
   * Skill entries worth loading, in a deterministic order.
   *
   * Instruction entries appear only in manifests published before schema v2 and are
   * dropped: they are the Copilot twin of the same knowledge, so including both would
   * double the token cost of every package for no added information.
   */
  skillEntries: (manifest: Manifest, categories: readonly string[]) => ManifestEntry[]
  /**
   * Turn one embedded skill file into a definition bound to the `Packages` block.
   *
   * The alias is namespaced by package so two packages documenting the same concept cannot
   * collide in the registry, and the order weight is pushed past the default so package
   * knowledge always renders after whatever the host declared itself.
   */
  toSkill: (packageName: string, entry: ManifestEntry, body: string) => SkillDefinition
}
