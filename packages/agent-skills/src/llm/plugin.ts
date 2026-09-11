import { PromptBlock, resolveFileProvider } from '@owlmeans/llm-common'
import { renderSkill } from '@owlmeans/llm/prompt'
import type { LlmPromptPlugin, PromptContext } from '@owlmeans/llm'
import { loadPackageSkills } from './resolve.js'
import { OWLMEANS_SCOPE } from './types.js'
import type { PackageSkills, PackageSkillsOptions } from './types.js'

export const PACKAGE_SKILLS_PLUGIN = 'owlmeans-packages'

const DEFAULT_MAX_PACKAGES = 5
const DEFAULT_CATEGORIES = ['package-specific', 'multi-package'] as const

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const textOf = (content: unknown): string => {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        const text = (part as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      })
      .join('\n')
  }

  return ''
}

/**
 * A prompt plugin that notices which `@owlmeans/*` packages a request talks about and
 * loads their published skills into the system prompt.
 *
 * Everything the package documents is loaded — there is no relevance filtering, by
 * design: choosing a subset would need a judgement the model is better placed to make
 * than a regex, and a partial answer about an API is worse than none.
 *
 * The result lands in the `Packages` block, which sits behind its own cache breakpoint.
 * That is the whole reason the block exists: what a request mentions changes call to
 * call, and it must not shift a single byte of the role and skills every call shares.
 */
export const owlmeansPackagesPlugin = (options: PackageSkillsOptions = {}): LlmPromptPlugin => {
  const scopes = options.scopes ?? [OWLMEANS_SCOPE]
  // No dots and no trailing hyphen, so `@owlmeans/llm.` yields `@owlmeans/llm` — prose
  // and code both end package names with punctuation.
  const pattern = new RegExp(
    `(?:${scopes.map(escape).join('|')})\\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?`, 'g'
  )
  const exclude = options.exclude ?? []
  const maxPackages = options.maxPackages ?? DEFAULT_MAX_PACKAGES
  const categories = options.categories ?? [...DEFAULT_CATEGORIES]

  /**
   * Resolved packages, negatives included. Without caching the misses, a prompt that
   * mentions a package which does not publish skills would hit GitHub on every call.
   */
  const cache = new Map<string, Promise<PackageSkills | null>>()

  /**
   * Per-provider caches, keyed by the provider INSTANCE.
   *
   * A host's file provider is usually per-project (a sandbox, a slot, one checkout), so
   * two executions can resolve the same package name to different content. Sharing one
   * cache across them would serve project A's skills to project B. A `WeakMap` keeps the
   * entries alive exactly as long as the provider is.
   */
  const perProvider = new WeakMap<object, Map<string, Promise<PackageSkills | null>>>()

  const load = (packageName: string, ctx: PromptContext): Promise<PackageSkills | null> => {
    // The context's provider is the specific one — it sees the project this call is
    // actually about. The constructor option is the fallback for a host that wires one
    // globally. Without this, a per-execution provider was never consulted at all.
    const provider = resolveFileProvider(ctx.files) ?? resolveFileProvider(options.files)
    const store = provider != null
      ? perProvider.get(provider) ?? (() => {
        const fresh = new Map<string, Promise<PackageSkills | null>>()
        perProvider.set(provider, fresh)
        return fresh
      })()
      : cache

    const pending = store.get(packageName)
    if (pending != null) {
      return pending
    }
    const promise = loadPackageSkills(packageName, { ...options, files: provider }, categories)
    store.set(packageName, promise)

    return promise
  }

  const detect = (ctx: PromptContext): string[] => {
    const found = new Set<string>()
    for (const message of ctx.messages) {
      const text = textOf((message as { content?: unknown }).content)
      if (text === '') {
        continue
      }
      for (const match of text.matchAll(pattern)) {
        found.add(match[0])
      }
    }

    // Alphabetical, not first-seen: two prompts that mention the same packages in a
    // different order must still produce the same bytes.
    return [...found]
      .filter(name => !exclude.includes(name))
      .sort()
      .slice(0, maxPackages)
  }

  return {
    alias: PACKAGE_SKILLS_PLUGIN,
    order: 50,

    inspect: async ctx => {
      const names = detect(ctx)
      if (names.length === 0) {
        return
      }
      const resolved = await Promise.all(names.map(name => load(name, ctx)))
      for (const found of resolved) {
        if (found == null) {
          continue
        }
        for (const skill of found.skills) {
          ctx.add(PromptBlock.Packages, renderSkill(skill))
        }
      }
    },
  }
}
