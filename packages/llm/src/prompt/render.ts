import { DEFAULT_SKILL_ORDER, type SkillDefinition } from '@owlmeans/llm-common'
import { CHUNK_SEPARATOR } from './consts.js'
import type { PromptRenderHelper } from './render/types.js'

export const createPromptRenderHelper = (): PromptRenderHelper => {
  const compareAlias = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

  const sortSkills = (skills: readonly SkillDefinition[]): SkillDefinition[] =>
    [...skills].sort((a, b) => {
      const left = a.order ?? DEFAULT_SKILL_ORDER
      const right = b.order ?? DEFAULT_SKILL_ORDER
      return left !== right ? left - right : compareAlias(a.alias, b.alias)
    })

  const renderSkill = (skill: SkillDefinition): string =>
    `## ${skill.title ?? skill.alias}\n\n${skill.body.trim()}`

  const joinChunks = (parts: readonly string[]): string =>
    parts.map(part => part.trim()).filter(part => part !== '').join(CHUNK_SEPARATOR)

  const prefixHash = (text: string): string => {
    let hash = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(36)
  }

  return { compareAlias, sortSkills, renderSkill, joinChunks, prefixHash }
}

export const promptRenderHelper = createPromptRenderHelper()

/** @deprecated compat:factory-refactor — use `promptRenderHelper.sortSkills(…)` */
export const sortSkills = (skills: readonly SkillDefinition[]): SkillDefinition[] => promptRenderHelper.sortSkills(skills)

/** @deprecated compat:factory-refactor — use `promptRenderHelper.renderSkill(…)` */
export const renderSkill = (skill: SkillDefinition): string => promptRenderHelper.renderSkill(skill)
