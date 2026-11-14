import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { createDirectoryCollectSink } from '@owlmeans/llm-reader'
import { ResearchStoreError } from './errors.js'
import type { DirectoryResearchStoreOptions, ResearchOutputs, ResearchSources, ResearchStore } from './store/types.js'
import { textUtils } from './utils/text.js'

/**
 * A research store on two local directories. Every path is confined to its root: absolute paths,
 * `..`, backslashes and NUL are refused with `ResearchStoreError`; files are written beside their
 * target and renamed into place.
 */
export const createDirectoryResearchStore = (options: DirectoryResearchStoreOptions): ResearchStore => {
  const sourcesRoot = resolve(options.sourcesRoot)
  const outputsRoot = resolve(options.outputsRoot)

  const confined = (root: string, path: string, allowRoot = false): string => {
    if (path.includes('\0') || path.includes('\\') || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
      throw new ResearchStoreError(`path:${path}`)
    }
    const segments = path.split('/').filter(segment => segment !== '' && segment !== '.')
    if (segments.some(segment => segment === '..')) throw new ResearchStoreError(`path:${path}`)
    if (segments.length === 0 && !allowRoot) throw new ResearchStoreError(`path:${path}`)
    const target = join(root, ...segments)
    if (target !== root && !target.startsWith(root + sep)) throw new ResearchStoreError(`path:${path}`)
    return target
  }

  const writeText = async (target: string, text: string): Promise<void> => {
    await mkdir(dirname(target), { recursive: true })
    const temporary = `${target}.${textUtils.digest(`${Date.now()}:${Math.random()}`)}.part`
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, target)
  }

  const readText = async (target: string): Promise<string | null> => {
    try {
      return await readFile(target, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'EISDIR') return null
      throw e
    }
  }

  const walk = async (directory: string, relative: string): Promise<string[]> => {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'ENOTDIR') return []
      throw e
    }
    const found: string[] = []
    for (const entry of entries) {
      const path = relative === '' ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) found.push(...await walk(join(directory, entry.name), path))
      else if (entry.isFile() && !entry.name.endsWith('.part')) found.push(path)
    }
    return found
  }

  const sources: ResearchSources = {
    sink: () => createDirectoryCollectSink(sourcesRoot),
    put: async (path, text) => writeText(confined(sourcesRoot, path), text),
    read: async path => readText(confined(sourcesRoot, path)),
    list: async (prefix = '') => {
      const base = confined(sourcesRoot, prefix, true)
      const clean = prefix.split('/').filter(segment => segment !== '' && segment !== '.').join('/')
      return (await walk(base, clean)).sort()
    },
    remove: async path => rm(confined(sourcesRoot, path), { recursive: true, force: true }),
    localRoot: async () => {
      await mkdir(sourcesRoot, { recursive: true })
      return sourcesRoot
    },
    drop: async () => rm(sourcesRoot, { recursive: true, force: true }),
  }

  const outputs: ResearchOutputs = {
    writeDoc: async (path, text) => writeText(confined(outputsRoot, path), text),
    readDoc: async path => readText(confined(outputsRoot, path)),
  }

  return { sources, outputs }
}
