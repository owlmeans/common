import { PromptBlock, renderCumulativeResults } from '@owlmeans/llm-common'
import type { SkillDefinition } from '@owlmeans/llm-common'
import { promptRenderHelper } from './render.js'
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
    for (const skill of promptRenderHelper.sortSkills([...merged.values()])) {
      ctx.add(skill.block ?? PromptBlock.Skills, promptRenderHelper.renderSkill(skill))
    }
  },
}

/**
 * Block 3 — what the earlier steps of the pipeline produced, as the pipeline runtime cut it for
 * the step this call belongs to (`PromptComposeParams.results`, normally `exec.results`).
 *
 * Contributes NOTHING without a view. With one, it opens the project message: it changes from one
 * step to the next, so it may never sit inside the system region other steps read back from cache.
 */
export const resultsPlugin: LlmPromptPlugin = {
  alias: 'results',
  order: 80,
  compose: ctx => {
    const text = renderCumulativeResults(ctx.results)
    if (text !== '') {
      ctx.add(PromptBlock.Results, text)
    }
  },
}

/**
 * Block 4 and the tail — whatever the caller handed over verbatim goes to `Context`, in the
 * project message; the skills requested for this one call go to the `Tail`, after the call's own
 * payload, where a set that changes per call costs no cached prefix anything.
 */
export const contextPlugin: LlmPromptPlugin = {
  alias: 'context',
  order: 90,
  compose: ctx => {
    // Each region gets ONE chunk rather than loose pieces: it reads as one instruction to the
    // model, and nothing downstream needs the parts separable.
    const context = ctx.input.context ?? []
    if (context.length > 0) {
      ctx.add(PromptBlock.Context, promptRenderHelper.joinChunks(context))
    }
    const skills = promptRenderHelper.sortSkills(ctx.resolve(ctx.input.callSkills ?? [])).map(promptRenderHelper.renderSkill)
    if (skills.length > 0) {
      ctx.add(PromptBlock.Tail, promptRenderHelper.joinChunks(skills))
    }
  },
}

/** The plugins every {@link PromptService} starts with, in run order. */
export const BUILT_IN_PROMPT_PLUGINS: readonly LlmPromptPlugin[] = [
  rolePlugin, skillsPlugin, resultsPlugin, contextPlugin,
] as const
