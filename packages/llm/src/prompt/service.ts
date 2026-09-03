import { createService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { PROMPT_BLOCK_ORDER, PromptBlock } from '@owlmeans/llm-common'
import type { SkillDefinition } from '@owlmeans/llm-common'
import {
  DEFAULT_CACHE_TTL, MAX_CACHE_BREAKPOINTS, MAX_SYSTEM_BREAKPOINTS, PROMPT_SERVICE,
} from '../consts.js'
import type { LlmSystemBlock } from '../plugins/types.js'
import { BUILT_IN_PROMPT_PLUGINS } from './plugins.js'
import { CHUNK_SEPARATOR, compareAlias, joinChunks } from './render.js'
import type {
  LlmPromptPlugin, PromptContext, PromptResult, PromptService, PromptServiceOptions,
  WithPromptService,
} from './types.js'

/** Sort weight of a plugin that declares none — between the built-in skills and context. */
const DEFAULT_PLUGIN_ORDER = 50

/** The part of {@link PromptService} this package implements — see {@link promptServiceApi}. */
export type PromptServiceApi =
  Pick<PromptService, 'use' | 'register' | 'has' | 'resolve' | 'skills' | 'compose'>

/**
 * Build the skill registry and composition chain WITHOUT registering a context service,
 * so a consumer can spread it into its own `createService` and publish extra methods
 * alongside it — the same pattern as `llmServiceApi` / `executionServiceApi`.
 *
 * `self` is late-bound because plugins resolve skills through the finished service, which
 * a consumer may have extended.
 */
export const promptServiceApi = (
  options: PromptServiceOptions,
  self: () => PromptService,
): PromptServiceApi => {
  const registry = new Map<string, SkillDefinition>()
  /** Registration index per plugin alias — the stable tiebreaker for equal `order`. */
  const seats = new Map<string, { plugin: LlmPromptPlugin; index: number }>()
  let seq = 0

  const seat = (plugin: LlmPromptPlugin): void => {
    const existing = seats.get(plugin.alias)
    // Re-registering under the same alias REPLACES rather than appends, so wiring the
    // same plugin twice (a shared context builder plus an app) cannot double-emit.
    seats.set(plugin.alias, { plugin, index: existing?.index ?? seq++ })
  }

  for (const plugin of [...BUILT_IN_PROMPT_PLUGINS, ...(options.plugins ?? [])]) {
    seat(plugin)
  }

  const ordered = (): LlmPromptPlugin[] =>
    [...seats.values()]
      .sort((a, b) => {
        const left = a.plugin.order ?? DEFAULT_PLUGIN_ORDER
        const right = b.plugin.order ?? DEFAULT_PLUGIN_ORDER
        return left !== right ? left - right : a.index - b.index
      })
      .map(entry => entry.plugin)

  const api: PromptServiceApi = {

    use: plugin => {
      seat(plugin)
    },

    register: (...skills) => {
      for (const skill of skills) {
        registry.set(skill.alias, skill)
      }
    },

    has: alias => registry.has(alias),

    skills: () => [...registry.values()].sort((a, b) => compareAlias(a.alias, b.alias)),

    /**
     * Depth-first over `requires` so a dependency is emitted before the skill that pulled
     * it in. Unknown aliases are skipped rather than thrown: a skill catalogue is often
     * assembled from several packages and a missing optional one should degrade the
     * prompt, not break the call.
     */
    resolve: aliases => {
      const seen = new Set<string>()
      const out: SkillDefinition[] = []
      const walk = (alias: string): void => {
        if (seen.has(alias)) {
          return
        }
        seen.add(alias)
        const skill = registry.get(alias)
        if (skill == null) {
          return
        }
        for (const required of skill.requires ?? []) {
          walk(required)
        }
        out.push(skill)
      }
      for (const alias of aliases) {
        walk(alias)
      }

      return out
    },

    compose: async (input, messages, params): Promise<PromptResult> => {
      const sections = new Map<PromptBlock, string[]>()
      // Scoped to this composition, never to the service: a claim is about who renders a
      // thing in ONE prompt, and carrying it across calls would silently drop the content
      // from every later prompt that shares the service.
      const claimed = new Set<string>()
      const ctx: PromptContext = {
        ...params,
        input,
        messages,
        add: (block, text) => {
          const trimmed = text.trim()
          if (trimmed === '') {
            return
          }
          const chunks = sections.get(block)
          if (chunks == null) {
            sections.set(block, [trimmed])
          } else {
            chunks.push(trimmed)
          }
        },
        resolve: aliases => self().resolve(aliases),
        claim: key => {
          if (claimed.has(key)) {
            return false
          }
          claimed.add(key)

          return true
        },
      }

      // Two passes, not one: every static contribution must be in place before a plugin
      // that reacts to the messages runs, so detection can see what is already covered.
      const chain = ordered()
      for (const plugin of chain) {
        await plugin.compose?.(ctx)
      }
      for (const plugin of chain) {
        await plugin.inspect?.(ctx)
      }

      const blocks: LlmSystemBlock[] = []
      for (const block of PROMPT_BLOCK_ORDER) {
        const text = joinChunks(sections.get(block) ?? [])
        if (text !== '') {
          blocks.push({ block, text })
        }
      }
      if (blocks.length === 0) {
        return { system: null, breakpoints: 0, blocks }
      }

      const cacheSystem = input.cacheSystem ?? options.cacheSystem ?? true
      const ttl = input.cacheTtl ?? options.cacheTtl ?? DEFAULT_CACHE_TTL
      const budget = Math.min(params.cacheMax ?? MAX_CACHE_BREAKPOINTS, MAX_SYSTEM_BREAKPOINTS)
      const render = cacheSystem && budget > 0
        ? params.provider?.patchSystem?.(blocks, { model: params.model, cacheMax: budget, ttl })
        : null

      return {
        system: {
          role: 'system',
          content: render?.content ?? blocks.map(block => block.text).join(CHUNK_SEPARATOR),
        },
        breakpoints: render?.breakpoints ?? 0,
        blocks,
      }
    },
  }

  api.register(...(options.skills ?? []))

  return api
}

export const makePromptService = (
  options: PromptServiceOptions = {},
  alias: string = PROMPT_SERVICE,
): PromptService => {
  const service: PromptService = createService<PromptService>(
    alias, promptServiceApi(options, () => service) as PromptService
  )

  return service
}

export const appendPromptService = <C extends BasicConfig, T extends BasicContext<C>>(
  ctx: T,
  options: PromptServiceOptions = {},
  alias: string = PROMPT_SERVICE,
): T & WithPromptService => {
  const context = ctx as T & WithPromptService

  context.registerService(makePromptService(options, alias))

  context.prompts = () => context.service<PromptService>(alias)

  return context
}
