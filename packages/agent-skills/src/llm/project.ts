import { PromptBlock, resolveFileProvider } from '@owlmeans/llm-common'
import type { FileProviderRef, LlmFileProvider } from '@owlmeans/llm-common'
import { compareAlias, prefixHash, renderSkill } from '@owlmeans/llm/prompt'
import type { LlmPromptPlugin, PromptContext } from '@owlmeans/llm'
import { DEFAULT_LIST_TTL, projectSkillsCache } from './cache.js'
import { contentText, matchRules, pickByModel } from './relevance.js'
import type { SkillActivationRule, SkillSignals } from './relevance.js'
import { parseSkillFile } from './skill-file.js'
import type { ProjectSkill } from './skill-file.js'

export const PROJECT_SKILLS_PLUGIN = 'project-skills'

/** The Agent Skills standard's install location. */
export const DEFAULT_SKILLS_DIR = '.agents/skills'

const SKILL_FILE = 'SKILL.md'
const SKILL_SUFFIX = `/${SKILL_FILE}`

const DEFAULT_MAX_ACTIVATED = 3
const DEFAULT_MAX_INDEX_ENTRIES = 40
const DEFAULT_DESCRIPTION_CHARS = 160
const DEFAULT_MAX_BODY_CHARS = 24000

/** Heading of the index block. Part of the cached prefix — changing it invalidates it. */
const INDEX_HEADING = '## Project skills'

const INDEX_LEAD =
  'Guidance installed in this project, by name and what it covers. The full text of one is '
  + 'loaded only when the work calls for it — ask for it by name rather than guessing at what '
  + 'it says.'

export interface ProjectSkillsOptions {
  /**
   * Host file access. The compose context's provider wins when both are present: that one
   * sees the project THIS call is about, which for a remote or sandboxed workspace is the
   * only tree that exists.
   */
  files?: FileProviderRef

  /** Directory the skills live in, relative to the project root. */
  dir?: string

  /** Deterministic activation rules. The default and only always-on mechanism. */
  rules?: SkillActivationRule[]

  /** A host's own activation decision, on top of the rules. */
  activate?: (signals: SkillSignals) => readonly string[] | Promise<readonly string[]>

  /** Skill names to ignore entirely — neither indexed nor activated. */
  exclude?: string[]

  /** Ceiling on bodies loaded into one prompt. Defaults to 3. */
  maxActivated?: number

  /** Ceiling on index lines. Defaults to 40. */
  maxIndexEntries?: number

  /** Description length in an index line. Defaults to 160. */
  descriptionChars?: number

  /** Length one activated body is clipped to. Defaults to 24000. */
  maxBodyChars?: number

  /**
   * Spend one cheap-model call (`PromptComposeParams.utility`) on picking which skills a
   * request needs, on top of whatever the rules picked. Off by default: it costs a round
   * trip on every call, and a host that knows its own domain writes better rules than a
   * model guessing from a one-line description.
   */
  relevanceModel?: boolean

  /** How long a directory listing is trusted. Defaults to 30000ms. */
  listTtlMs?: number
}

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max).trimEnd()}...`

/** `.agents/skills/foo/SKILL.md` -> `foo`, for exactly that shape and no other. */
const nameOf = (path: string, dir: string): string | null => {
  const normalized = path.replace(/^\.\//, '').replace(/^\/+/, '')
  const prefix = `${dir}/`
  if (!normalized.startsWith(prefix) || !normalized.endsWith(SKILL_SUFFIX)) {
    return null
  }
  const middle = normalized.slice(prefix.length, normalized.length - SKILL_SUFFIX.length)

  return middle !== '' && !middle.includes('/') ? middle : null
}

export interface LoadProjectSkillsOptions {
  dir?: string
  exclude?: string[]
  listTtlMs?: number
}

/**
 * Every valid skill installed in the project, sorted by name.
 *
 * Reads exclusively through the {@link LlmFileProvider} — never `node:fs`. The project an
 * agent works on is routinely somewhere this process cannot reach (a sandbox, a container,
 * a remote workspace), and a plugin that reaches for the local filesystem silently
 * describes the wrong project rather than failing.
 */
export const loadProjectSkills = async (
  provider: LlmFileProvider,
  options: LoadProjectSkillsOptions = {},
): Promise<ProjectSkill[]> => {
  const dir = options.dir ?? DEFAULT_SKILLS_DIR
  const exclude = options.exclude ?? []
  const cache = projectSkillsCache(provider)

  const paths = await cache.list(dir, options.listTtlMs ?? DEFAULT_LIST_TTL, async () => {
    try {
      return await provider.getSourceList(`${dir}/*${SKILL_SUFFIX}`)
    } catch {
      return []
    }
  })

  // The listing is filtered rather than trusted: `getSourceList` is the host's own glob,
  // and hosts differ on whether a pattern recurses. Only the standard's own layout —
  // one directory per skill — counts.
  const wanted = [...new Set(paths)]
    .map(path => ({ path, name: nameOf(path, dir) }))
    .filter((entry): entry is { path: string, name: string } =>
      entry.name != null && !exclude.includes(entry.name))
    .sort((a, b) => compareAlias(a.name, b.name))

  const loaded = await Promise.all(wanted.map(async entry => await cache.skill(
    entry.path,
    async () => {
      try {
        return parseSkillFile(entry.path, await provider.readFile(entry.path, true) ?? '')
      } catch {
        return null
      }
    },
  )))

  return loaded.filter((skill): skill is ProjectSkill => skill != null)
}

const renderIndex = (skills: readonly ProjectSkill[], descriptionChars: number): string =>
  [
    INDEX_HEADING,
    '',
    INDEX_LEAD,
    '',
    ...skills.map(skill => `- ${skill.name} — ${clip(skill.description, descriptionChars)}`),
  ].join('\n')

/**
 * A prompt plugin that teaches a call about the skills the PROJECT itself has installed —
 * the Agent Skills standard's `.agents/skills/<name>/SKILL.md` directories.
 *
 * It splits the two halves of a skill across two blocks on purpose, because they have
 * completely different cache lifetimes. The INDEX (name + description, one line each) is a
 * property of the project, identical on every call about it, so it belongs in the stable
 * `Skills` block behind a breakpoint. A full BODY is a property of one request, so it goes
 * into `Packages`, which carries its own breakpoint and may change freely. That is
 * progressive disclosure expressed as a cache layout: the model always knows what exists
 * and pays for the text of a skill only when something says this call is about it.
 *
 * Runs at 55 — after `owlmeansPackagesPlugin` (50), so a package that a request actually
 * mentioned claims a shared name first. A mention is the more specific signal.
 */
export const projectSkillsPlugin = (options: ProjectSkillsOptions = {}): LlmPromptPlugin => {
  const dir = options.dir ?? DEFAULT_SKILLS_DIR
  const rules = options.rules ?? []
  const maxActivated = options.maxActivated ?? DEFAULT_MAX_ACTIVATED
  const maxIndexEntries = options.maxIndexEntries ?? DEFAULT_MAX_INDEX_ENTRIES
  const descriptionChars = options.descriptionChars ?? DEFAULT_DESCRIPTION_CHARS
  const maxBodyChars = options.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS

  /**
   * Candidates resolved once per composition. `compose` and `inspect` are two passes over
   * the same context object and both need the same list — recomputing it in the second
   * pass could see a listing that expired in between, and index one set of skills while
   * emitting the body of another.
   */
  const pending = new WeakMap<PromptContext, Promise<ProjectSkill[]>>()

  const providerOf = (ctx: PromptContext): LlmFileProvider | undefined =>
    resolveFileProvider(ctx.files) ?? resolveFileProvider(options.files)

  const candidates = (ctx: PromptContext): Promise<ProjectSkill[]> => {
    const known = pending.get(ctx)
    if (known != null) {
      return known
    }
    const loading = (async () => {
      const provider = providerOf(ctx)
      if (provider == null) {
        return []
      }
      const skills = await loadProjectSkills(provider, { ...options, dir })

      // A skill the host already registered under the same name is the host's to render.
      // Indexing it too would advertise one thing under two descriptions and invite the
      // model to ask for a body the static block already carries.
      return skills.filter(skill => ctx.resolve([skill.name]).length === 0)
    })()
    pending.set(ctx, loading)

    return loading
  }

  const signalsOf = (ctx: PromptContext, skills: readonly ProjectSkill[]): SkillSignals => ({
    purposeType: ctx.purpose?.type,
    action: ctx.action,
    text: ctx.messages
      .map(message => contentText((message as { content?: unknown }).content))
      .join('\n'),
    names: skills.map(skill => skill.name),
  })

  const chosen = async (
    ctx: PromptContext,
    skills: readonly ProjectSkill[],
  ): Promise<string[]> => {
    const signals = signalsOf(ctx, skills)
    const known = new Set(signals.names)
    const picked: string[] = []
    const take = (names: Iterable<string>): void => {
      for (const name of names) {
        if (known.has(name) && !picked.includes(name)) {
          picked.push(name)
        }
      }
    }

    // What the call asked for by name outranks everything guessed: a caller naming a skill
    // has stated the intent the other mechanisms are trying to infer.
    take([...ctx.input.skills ?? [], ...ctx.input.callSkills ?? []])
    take(matchRules(rules, signals))
    if (options.activate != null) {
      take(await options.activate(signals))
    }

    if (options.relevanceModel === true && picked.length < maxActivated) {
      const provider = providerOf(ctx)
      const model = ctx.utility?.()
      if (provider != null && model != null) {
        const cache = projectSkillsCache(provider)
        // Memoised per request signature so a retry re-sends the same bytes. A pick that
        // varied between attempts would defeat the retry's whole reason to exist.
        const digest = prefixHash([
          signals.purposeType ?? '', signals.action ?? '', signals.names.join(','), signals.text,
        ].join(' '))
        take(await cache.memo(
          `relevance:${digest}`,
          async () => await pickByModel(skills, signals, model, maxActivated - picked.length),
        ))
      }
    }

    // Sorted, not in pick order: two calls that activate the same skills through different
    // mechanisms must render identical bytes.
    return picked.sort(compareAlias).slice(0, maxActivated)
  }

  return {
    alias: PROJECT_SKILLS_PLUGIN,
    order: 55,

    compose: async ctx => {
      const skills = await candidates(ctx)
      if (skills.length === 0) {
        return
      }
      ctx.add(PromptBlock.Skills, renderIndex(skills.slice(0, maxIndexEntries), descriptionChars))
    },

    inspect: async ctx => {
      const skills = await candidates(ctx)
      if (skills.length === 0) {
        return
      }
      const activated = await chosen(ctx, skills)
      const byName = new Map(skills.map(skill => [skill.name, skill]))
      for (const name of activated) {
        const skill = byName.get(name)
        // Claimed by someone more specific — the package plugin, when the request named
        // the `@owlmeans/*` package this skill documents. Rendering it again would tell
        // the model the same thing twice, in two voices, at full body price.
        if (skill == null || !ctx.claim(`skill:${name}`)) {
          continue
        }
        ctx.add(PromptBlock.Packages, renderSkill({
          alias: skill.name,
          body: clip(skill.body, maxBodyChars),
        }))
      }
    },
  }
}
