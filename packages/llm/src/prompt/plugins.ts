import { PromptBlock } from '@owlmeans/llm-common'
import type { SkillDefinition } from '@owlmeans/llm-common'
import { joinChunks, renderSkill, sortSkills } from './render.js'
import type { LlmPromptPlugin } from './types.js'

/**
 * Block 0 — the base system prompt that tells the model who it is.
 *
 * The most stable thing in the whole request, so it goes first and every cache boundary
 * sits behind it.
 */
export const rolePlugin: LlmPromptPlugin = {
  alias: 'role',
  order: 0,
  compose: ctx => {
    if (ctx.input.role != null && ctx.input.role.trim() !== '') {
      ctx.add(PromptBlock.Role, ctx.input.role)
    }
  },
}

/**
 * Block 1 — the declared capabilities, rendered in a deterministic order.
 *
 * Registry skills and inline skills are merged by alias with inline winning, so a caller
 * can override one registered entry without forking the catalogue.
 */
export const skillsPlugin: LlmPromptPlugin = {
  alias: 'skills',
  order: 10,
  compose: ctx => {
    const declared = ctx.resolve(ctx.input.skills ?? [])
    const merged = new Map<string, SkillDefinition>()
    for (const skill of [...declared, ...(ctx.input.inline ?? [])]) {
      merged.set(skill.alias, skill)
    }
    for (const skill of sortSkills([...merged.values()])) {
      ctx.add(skill.block ?? PromptBlock.Skills, renderSkill(skill))
    }
  },
}

/**
 * Block 3 — whatever the caller handed over verbatim, plus any skills requested for this
 * one call. Emitted last and never marked cacheable: its content varies per request by
 * definition, and a varying tail must not sit inside a prefix other calls depend on.
 */
export const contextPlugin: LlmPromptPlugin = {
  alias: 'context',
  order: 90,
  compose: ctx => {
    // Everything volatile is merged into ONE chunk rather than added piece by piece: the
    // block carries no cache breakpoint, so there is nothing to gain from keeping the
    // parts separable, and a single contiguous section reads as one instruction to the
    // model instead of a pile of loose fragments.
    const parts = [
      ...sortSkills(ctx.resolve(ctx.input.callSkills ?? [])).map(renderSkill),
      ...(ctx.input.context ?? []),
    ]
    if (parts.length > 0) {
      ctx.add(PromptBlock.Context, joinChunks(parts))
    }
  },
}

/** The plugins every {@link PromptService} starts with, in run order. */
export const BUILT_IN_PROMPT_PLUGINS: readonly LlmPromptPlugin[] = [
  rolePlugin, skillsPlugin, contextPlugin,
] as const
