import type { SkillDefinition } from '@owlmeans/llm-common'

/** The one way a prompt is rendered and glued — byte-identical between calls, so caches hit. */
export interface PromptRenderHelper {
  /**
   * Code-unit comparison, NOT `localeCompare`.
   *
   * `localeCompare` orders differently depending on the host's ICU data and locale, so two
   * processes could render the same skill set in different orders and never share a cache
   * entry. Skill aliases are ASCII slugs; a plain comparison is both correct and stable.
   */
  compareAlias: (a: string, b: string) => number
  /** Deterministic skill order: declared weight first, alias as the tiebreaker. */
  sortSkills: (skills: readonly SkillDefinition[]) => SkillDefinition[]
  /** Fixed rendering of one skill. Changing this shape invalidates every cached prefix. */
  renderSkill: (skill: SkillDefinition) => string
  /** Join rendered chunks into one block, dropping empties. */
  joinChunks: (parts: readonly string[]) => string
  /**
   * Stable digest of a cache prefix — FNV-1a, so there is no crypto dependency and the
   * result is identical on every runtime. Used as a provider cache-routing key (OpenAI's
   * `prompt_cache_key`), never for security.
   */
  prefixHash: (text: string) => string
}
