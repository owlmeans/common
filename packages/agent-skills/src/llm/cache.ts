import type { LlmFileProvider } from '@owlmeans/llm-common'
import type { ProjectSkill } from './skill-file.js'

/** How long a directory listing is trusted before it is read again. */
export const DEFAULT_LIST_TTL = 30000

/** How many distinct projects are remembered at once. */
export const DEFAULT_MAX_PROJECTS = 32

/** Ceiling on memoised side answers per project — a relevance pick per distinct request. */
const MAX_MEMOS = 64

interface ProjectEntry {
  lists: Map<string, { at: number, paths: Promise<string[]> }>
  skills: Map<string, Promise<ProjectSkill | null>>
  memos: Map<string, Promise<unknown>>
}

export interface ProjectSkillsCache {
  /** The skill files under `dir`, re-listed once the entry is older than `ttlMs`. */
  list: (dir: string, ttlMs: number, load: () => Promise<string[]>) => Promise<string[]>
  /** One parsed skill, kept for the life of the project entry. */
  skill: (path: string, load: () => Promise<ProjectSkill | null>) => Promise<ProjectSkill | null>
  /** Anything else that must reproduce byte-for-byte across retries of the same call. */
  memo: <T>(key: string, load: () => Promise<T>) => Promise<T>
}

/**
 * Cached projects, keyed by {@link LlmFileProvider.key}.
 *
 * Module-level rather than per plugin instance, because the thing being cached belongs to
 * the PROJECT, not to whoever happens to be asking: a host that rebuilds its prompt
 * plugins per request would otherwise re-read the whole skills directory every call.
 */
const keyed = new Map<string, ProjectEntry>()

/**
 * The fallback for a provider that declares no key.
 *
 * Such a provider is not one more anonymous member of a shared bucket — two keyless
 * providers may well be two different projects, and serving the first one's skills to the
 * second is worse than any cache miss. Keying by INSTANCE is the only honest identity
 * left, and a `WeakMap` keeps the entry alive exactly as long as the provider is.
 */
const anonymous = new WeakMap<object, ProjectEntry>()

const freshEntry = (): ProjectEntry => ({
  lists: new Map(),
  skills: new Map(),
  memos: new Map(),
})

const bound = <K, V>(store: Map<K, V>, key: K, value: V, max: number): void => {
  store.set(key, value)
  while (store.size > max) {
    const oldest = store.keys().next()
    if (oldest.done === true) {
      return
    }
    store.delete(oldest.value)
  }
}

const entryFor = (provider: LlmFileProvider, maxProjects: number): ProjectEntry => {
  const key = provider.key
  if (key == null || key === '') {
    const existing = anonymous.get(provider)
    if (existing != null) {
      return existing
    }
    const fresh = freshEntry()
    anonymous.set(provider, fresh)

    return fresh
  }

  const existing = keyed.get(key)
  if (existing != null) {
    // Re-insert so eviction drops the project nobody has touched, not the oldest one.
    keyed.delete(key)
    keyed.set(key, existing)

    return existing
  }
  const fresh = freshEntry()
  bound(keyed, key, fresh, maxProjects)

  return fresh
}

export interface ProjectSkillsCacheOptions {
  maxProjects?: number
}

/**
 * The read cache one project's skills are served from.
 *
 * Listings expire on a short TTL because a skills directory is edited by hand while an
 * agent is running; parsed bodies do not, because they are keyed by path and a file whose
 * content changed is picked up on the next listing anyway. Both matter for more than
 * latency: a retried call must compose the same bytes, or it cannot reuse the prefix
 * cache it was retried to save.
 */
export const projectSkillsCache = (
  provider: LlmFileProvider,
  options: ProjectSkillsCacheOptions = {},
): ProjectSkillsCache => {
  const entry = entryFor(provider, options.maxProjects ?? DEFAULT_MAX_PROJECTS)

  return {
    list: async (dir, ttlMs, load) => {
      const now = Date.now()
      const cached = entry.lists.get(dir)
      if (cached != null && now - cached.at < ttlMs) {
        return await cached.paths
      }
      const paths = load()
      entry.lists.set(dir, { at: now, paths })

      return await paths
    },

    skill: async (path, load) => {
      const cached = entry.skills.get(path)
      if (cached != null) {
        return await cached
      }
      const skill = load()
      entry.skills.set(path, skill)

      return await skill
    },

    memo: async <T>(key: string, load: () => Promise<T>): Promise<T> => {
      const cached = entry.memos.get(key)
      if (cached != null) {
        return await cached as T
      }
      const value = load()
      bound(entry.memos, key, value, MAX_MEMOS)

      return await value
    },
  }
}

/**
 * Forget what was read for one project — call it after writing a skill file into a
 * project the agent is still working in, so the next prompt sees it.
 *
 * Omit `key` to forget every keyed project. Providers that declare no key are cached by
 * instance and are dropped when the provider itself is.
 */
export const invalidateProjectSkills = (key?: string): void => {
  if (key == null) {
    keyed.clear()
    return
  }
  keyed.delete(key)
}
