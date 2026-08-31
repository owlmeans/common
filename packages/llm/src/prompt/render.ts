import { DEFAULT_SKILL_ORDER } from '@owlmeans/llm-common'
import type { SkillDefinition } from '@owlmeans/llm-common'

/**
 * Separator between rendered chunks. Every join in this file goes through it: the
 * composed prompt must be byte-identical between calls, so there is exactly one way to
 * glue things together.
 */
export const CHUNK_SEPARATOR = '\n\n'

/**
 * Code-unit comparison, NOT `localeCompare`.
 *
 * `localeCompare` orders differently depending on the host's ICU data and locale, so two
 * processes could render the same skill set in different orders and never share a cache
 * entry. Skill aliases are ASCII slugs; a plain comparison is both correct and stable.
 */
export const compareAlias = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

/** Deterministic skill order: declared weight first, alias as the tiebreaker. */
export const sortSkills = (skills: readonly SkillDefinition[]): SkillDefinition[] =>
  [...skills].sort((a, b) => {
    const left = a.order ?? DEFAULT_SKILL_ORDER
    const right = b.order ?? DEFAULT_SKILL_ORDER
    return left !== right ? left - right : compareAlias(a.alias, b.alias)
  })

/** Fixed rendering of one skill. Changing this shape invalidates every cached prefix. */
export const renderSkill = (skill: SkillDefinition): string =>
  `## ${skill.title ?? skill.alias}\n\n${skill.body.trim()}`

/** Join rendered chunks into one block, dropping empties. */
export const joinChunks = (parts: readonly string[]): string =>
  parts.map(part => part.trim()).filter(part => part !== '').join(CHUNK_SEPARATOR)

/**
 * Stable digest of a cache prefix — FNV-1a, so there is no crypto dependency and the
 * result is identical on every runtime. Used as a provider cache-routing key (OpenAI's
 * `prompt_cache_key`), never for security.
 */
export const prefixHash = (text: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}
