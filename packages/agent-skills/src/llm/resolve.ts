import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { resolveFileProvider, type LlmFileProvider, type SkillDefinition } from '@owlmeans/llm-common'
import { manifestHelper } from './manifest.js'
import type { PackageSkills, PackageSkillsOptions } from './types.js'
import { AGENT_META, DEFAULT_REF, DEFAULT_REPO, DEFAULT_TIMEOUT, MANIFEST, PACKAGE_DIR } from './consts.local.js'


/** Path of an embedded file relative to a project root, in the host's own terms. */
const projectPath = (packageName: string, ...parts: string[]): string =>
  ['node_modules', packageName, AGENT_META, ...parts].join('/')

/**
 * Source 1 — the host's own file access.
 *
 * Tried first because it is the only one that sees the project the model is actually
 * working on: a sandbox, a remote workspace, a container this process cannot reach.
 */
const fromFiles = async (
  packageName: string,
  provider: LlmFileProvider,
  categories: readonly string[],
): Promise<PackageSkills | null> => {
  const read = async (path: string): Promise<string> => {
    try {
      return await provider.readFile(path, true) ?? ''
    } catch {
      return ''
    }
  }

  const manifest = manifestHelper.parseManifest(await read(projectPath(packageName, MANIFEST)))
  if (manifest == null) {
    return null
  }

  const skills: SkillDefinition[] = []
  for (const entry of manifestHelper.skillEntries(manifest, categories)) {
    const body = manifestHelper.stripMeta(await read(projectPath(packageName, entry.file)))
    if (body !== '') {
      skills.push(manifestHelper.toSkill(packageName, entry, body))
    }
  }

  return skills.length > 0
    ? { packageName, version: manifest.version, source: 'files', skills }
    : null
}

/**
 * Source 2 — an installed copy on this filesystem.
 *
 * Walks upward rather than assuming a layout: a hoisted install puts the package at the
 * workspace root, a nested one puts it beside the consumer.
 */
const findLocalDir = (packageName: string, from: string): string | null => {
  let current = resolvePath(from)
  for (; ;) {
    const candidate = join(current, 'node_modules', packageName, AGENT_META)
    if (existsSync(join(candidate, MANIFEST))) {
      return candidate
    }
    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

/** One `agent-meta/` directory on this filesystem, read synchronously; a miss is `null`. */
const fromDir = (
  packageName: string,
  dir: string,
  categories: readonly string[],
  source: 'local' | 'checkout',
): PackageSkills | null => {
  const read = (path: string): string => {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return ''
    }
  }

  const manifest = manifestHelper.parseManifest(read(join(dir, MANIFEST)))
  if (manifest == null) {
    return null
  }

  const skills: SkillDefinition[] = []
  for (const entry of manifestHelper.skillEntries(manifest, categories)) {
    const body = manifestHelper.stripMeta(read(join(dir, ...entry.file.split('/'))))
    if (body !== '') {
      skills.push(manifestHelper.toSkill(packageName, entry, body))
    }
  }

  return skills.length > 0
    ? { packageName, version: manifest.version, source, skills }
    : null
}

const fromLocal = (
  packageName: string,
  from: string,
  categories: readonly string[],
): PackageSkills | null => {
  const dir = findLocalDir(packageName, from)

  return dir == null ? null : fromDir(packageName, dir, categories, 'local')
}

/**
 * Source 3, from disk — a CHECKOUT of the canonical repository, read in place of GitHub.
 *
 * The same `packages/<name>/agent-meta/` files the remote source asks GitHub for, at the same
 * repo-relative paths, so a checkout serves exactly what pushing it to the ref would. It exists for
 * a development host that mounts one: the only way it can see a package or a skill that is not
 * pushed yet. A file missing here is a miss, exactly as a failed fetch is.
 */
const fromCheckout = (
  packageName: string,
  root: string,
  categories: readonly string[],
): PackageSkills | null => {
  const name = manifestHelper.unscoped(packageName)
  if (!PACKAGE_DIR.test(name) || name.includes('..')) {
    return null
  }

  return fromDir(packageName, join(root, 'packages', name, AGENT_META), categories, 'checkout')
}

/**
 * Source 3 — the canonical repository, for a package that is mentioned but not installed.
 *
 * It reads the EMBEDDED copies (`packages/<name>/agent-meta/`) rather than the canonical
 * root ones: the embedded layout is uniform across packages and is exactly what the
 * manifest describes, so one shape of URL works for every package.
 */
const fromRemote = async (
  packageName: string,
  options: PackageSkillsOptions,
  categories: readonly string[],
): Promise<PackageSkills | null> => {
  if (options.fetch === false || typeof globalThis.fetch !== 'function') {
    return null
  }
  const repo = options.repo ?? DEFAULT_REPO
  const ref = options.ref ?? DEFAULT_REF
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const url = (file: string): string =>
    `https://raw.githubusercontent.com/${repo}/${ref}/packages/${manifestHelper.unscoped(packageName)}/${AGENT_META}/${file}`

  // Every failure here is a miss, never a throw: a prompt plugin that breaks the call
  // because GitHub was slow is worse than a prompt without one package's knowledge.
  const get = async (file: string): Promise<string> => {
    try {
      const response = await fetch(url(file), { signal: AbortSignal.timeout(timeout) })
      return response.ok ? await response.text() : ''
    } catch {
      return ''
    }
  }

  const manifest = manifestHelper.parseManifest(await get(MANIFEST))
  if (manifest == null) {
    return null
  }

  const entries = manifestHelper.skillEntries(manifest, categories)
  const bodies = await Promise.all(entries.map(async entry => manifestHelper.stripMeta(await get(entry.file))))
  const skills = entries
    .map((entry, i) => ({ entry, body: bodies[i]! }))
    .filter(({ body }) => body !== '')
    .map(({ entry, body }) => manifestHelper.toSkill(packageName, entry, body))

  return skills.length > 0
    ? { packageName, version: manifest.version, source: 'remote', skills }
    : null
}

/** Try each source in order of trustworthiness and cost. */
export const loadPackageSkills = async (
  packageName: string,
  options: PackageSkillsOptions,
  categories: readonly string[],
): Promise<PackageSkills | null> => {
  const provider = resolveFileProvider(options.files)
  if (provider != null) {
    const found = await fromFiles(packageName, provider, categories)
    if (found != null) {
      return found
    }
  }

  const local = fromLocal(packageName, options.dir ?? process.cwd(), categories)
  if (local != null) {
    return local
  }

  // A configured checkout REPLACES the remote source — GitHub is not asked as well.
  const root = options.localRoot?.trim()
  if (root != null && root !== '') {
    return fromCheckout(packageName, root, categories)
  }

  return fromRemote(packageName, options, categories)
}
