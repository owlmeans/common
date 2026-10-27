import { PromptBlock, resolveFileProvider, type PromptFocus } from '@owlmeans/llm-common'
import type { LlmPromptPlugin, PromptContext } from '@owlmeans/llm'
import { loadPackageSkills } from './resolve.js'
import { OWLMEANS_SCOPE, PACKAGE_SKILLS_PLUGIN } from './consts.js'
import type { PackagePart, PackageSkills, PackageSkillsOptions } from './types.js'
import type { DetectedPackages, PartSelector } from './types.local.js'
import {
  DEFAULT_CATEGORIES, DEFAULT_LATE_MAX_CHARS, DEFAULT_LATE_MAX_PACKAGES, DEFAULT_MAX_PACKAGES,
} from './consts.local.js'
import { promptRenderHelper } from '@owlmeans/llm'


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

/** Code-unit order — never `localeCompare`: the rendered bytes must not depend on a locale. */
const byCodeUnits = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

/**
 * A prompt plugin that loads the published skills of `@owlmeans/*` packages into the
 * `Packages` block — a package's core, plus the purpose parts the call needs.
 *
 * Two modes:
 * - **Focus** — the call's prompt policy carries a `PromptFocus` that lists `packages`. Those
 *   packages, sorted, each render their cores, then the parts whose purposes meet the focus
 *   purposes or that the focus names (`<package>#<part>`), in part-name order. The messages never
 *   change this block, so it is byte-stable for a persona and story. A package the messages
 *   IMPORT but the focus lacks goes to the per-call `Tail`, cores only, within the late caps,
 *   unless the focus says `late: false`.
 * - **Detect** — no focus packages: the packages the messages mention, imported ones ranked
 *   before merely named ones and capped at `maxPackages`, each with its cores plus the parts whose
 *   mentions appear in the messages (or that a focus without packages selects by purpose or name).
 *
 * Within a core or a part there is no relevance filtering, by design: a partial answer about an
 * API is worse than none. Purposes and mentions are read from the manifest, never a part file.
 */
export const owlmeansPackagesPlugin = (options: PackageSkillsOptions = {}): LlmPromptPlugin => {
  const scopes = options.scopes ?? [OWLMEANS_SCOPE]
  const scopeAlternatives = scopes.map(escape).join('|')
  // No dots and no trailing hyphen, so `@owlmeans/llm.` yields `@owlmeans/llm` — prose
  // and code both end package names with punctuation.
  const packageNameRe = `(?:${scopeAlternatives})\\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?`
  const pattern = new RegExp(packageNameRe, 'g')
  // A module specifier after `from`, `import`, `import(`, `require(` — a subpath counts as its
  // package. What a file imports it is certainly written against; what it names it may not be.
  const importPattern = new RegExp(
    `(?:\\bfrom|\\bimport|\\brequire)\\s*\\(?\\s*['"\`](${packageNameRe})(?:\\/[^'"\`\\s]*)?['"\`]`, 'g',
  )
  const exclude = options.exclude ?? []
  const maxPackages = options.maxPackages ?? DEFAULT_MAX_PACKAGES
  const categories = options.categories ?? [...DEFAULT_CATEGORIES]
  const lateMaxPackages = options.lateMaxPackages ?? DEFAULT_LATE_MAX_PACKAGES
  const lateMaxChars = options.lateMaxChars ?? DEFAULT_LATE_MAX_CHARS

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

  /** A mention as a whole token: `Footer` must not fire on `FooterLink`. */
  const mentionPatterns = new Map<string, RegExp>()
  const mentionOf = (mention: string): RegExp => {
    let re = mentionPatterns.get(mention)
    if (re == null) {
      re = new RegExp(`(?<![A-Za-z0-9_$])${escape(mention)}(?![A-Za-z0-9_$])`)
      mentionPatterns.set(mention, re)
    }
    return re
  }

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

  const textsOf = (ctx: PromptContext): string[] =>
    ctx.messages
      .map(message => textOf((message as { content?: unknown }).content))
      .filter(text => text !== '')

  const allowed = (packageName: string): boolean => !exclude.includes(packageName)

  /** Packages the messages name anywhere, and the subset they import. */
  const detect = (texts: string[]): DetectedPackages => {
    const named = new Set<string>()
    const imported = new Set<string>()
    for (const text of texts) {
      for (const match of text.matchAll(pattern)) {
        named.add(match[0])
      }
      for (const match of text.matchAll(importPattern)) {
        imported.add(match[1]!)
      }
    }

    return { named, imported }
  }

  const render = (ctx: PromptContext, block: PromptBlock, found: PackageSkills, parts: PackagePart[]): void => {
    for (const skill of found.skills) {
      ctx.add(block, promptRenderHelper.renderSkill(skill))
    }
    for (const part of parts) {
      ctx.add(block, promptRenderHelper.renderSkill(part.skill))
    }
  }

  /** What a focus selects a part by, besides the mentions detect mode adds. */
  const focusSelector = (focus: PromptFocus | undefined): PartSelector => {
    const purposes = new Set<string>(focus?.purposes ?? [])
    const named = new Set(focus?.parts ?? [])

    return (packageName, part) =>
      part.purposes.some(purpose => purposes.has(purpose)) || named.has(`${packageName}#${part.name}`)
  }

  const inspectFocus = async (ctx: PromptContext, focus: PromptFocus, packages: string[]): Promise<void> => {
    const chosen = [...new Set(packages)].filter(allowed).sort(byCodeUnits)
    const selects = focusSelector(focus)

    const resolved = await Promise.all(chosen.map(packageName => load(packageName, ctx)))
    for (const found of resolved) {
      if (found != null) {
        render(ctx, PromptBlock.Packages, found, found.parts.filter(part => selects(found.packageName, part)))
      }
    }

    if (focus.late === false) {
      return
    }

    // Late: imported here, absent from the focus. Uncached, so cores only and capped; a package
    // that would overflow the char budget is skipped and the next one tried, in name order.
    const focused = new Set(chosen)
    const late = [...detect(textsOf(ctx)).imported]
      .filter(packageName => allowed(packageName) && !focused.has(packageName))
      .sort(byCodeUnits)
    if (late.length === 0) {
      return
    }
    const loaded = await Promise.all(late.map(packageName => load(packageName, ctx)))
    let count = 0
    let chars = 0
    for (const found of loaded) {
      if (count >= lateMaxPackages) {
        break
      }
      if (found == null || found.skills.length === 0) {
        continue
      }
      const size = found.skills.reduce((sum, skill) => sum + promptRenderHelper.renderSkill(skill).length, 0)
      if (chars + size > lateMaxChars) {
        continue
      }
      render(ctx, PromptBlock.Tail, found, [])
      count++
      chars += size
    }
  }

  const inspectDetect = async (ctx: PromptContext, focus: PromptFocus | undefined): Promise<void> => {
    const texts = textsOf(ctx)
    const { named, imported } = detect(texts)
    const ranked = [
      ...[...imported].filter(allowed).sort(byCodeUnits),
      ...[...named].filter(packageName => allowed(packageName) && !imported.has(packageName)).sort(byCodeUnits),
    ]
    // Imported first, so the cap drops a name-dropped package before one the code is written
    // against; then alphabetical, so two prompts naming the same set render the same bytes.
    const names = ranked.slice(0, maxPackages).sort(byCodeUnits)
    if (names.length === 0) {
      return
    }

    const selects = focusSelector(focus)
    const mentioned = (part: PackagePart): boolean =>
      part.mentions.some(mention => texts.some(text => mentionOf(mention).test(text)))

    const resolved = await Promise.all(names.map(packageName => load(packageName, ctx)))
    for (const found of resolved) {
      if (found != null) {
        render(ctx, PromptBlock.Packages, found,
          found.parts.filter(part => mentioned(part) || selects(found.packageName, part)))
      }
    }
  }

  return {
    alias: PACKAGE_SKILLS_PLUGIN,
    order: 50,

    inspect: async ctx => {
      const focus = ctx.input.focus
      if (focus?.packages != null) {
        await inspectFocus(ctx, focus, focus.packages)
        return
      }
      await inspectDetect(ctx, focus)
    },
  }
}
