import fs from 'fs-extra'
import { globby } from 'globby'
import p from 'node:path'

import { CONNECT_MARKER_DIR, METADATA_DIRS, METADATA_SUFFIXES, SubProject } from '@owlmeans/viable-common'

import { SandboxPathError } from './errors.js'
import { subprojectDir, targetPaths } from './layout.js'

/** What `readSource` and friends answer with — the shape the platform's file helpers parse. */
export interface LocalSourceFile {
  path: string
  code?: string
}

export interface SourceListOptions {
  skipUIElements?: boolean
  excludes?: string[]
}

/**
 * The target's files, as the platform asks for them.
 *
 * Shaped exactly like the publisher's `createFileHelper`, because the caller is the same code:
 * the agent's remote helper sends a `SlotFileCommand` and parses one of these answers, and it has
 * no way to know whether a pod or a laptop produced it.
 */
export const createLocalFileHelper = (projectPath: string) => {
  const rootPath = wrapWithSlashes(p.resolve(projectPath))

  // Every path below asks the tree which layout it holds, per call, rather than closing over one
  // answer: a project is re-initialized in place, and this helper outlives that. `packages/` for
  // a target generated before the move, `sources/` for one generated after it.
  const layout = () => targetPaths(rootPath)
  const dirOf = (role: SubProject) => subprojectDir(rootPath, role)

  /**
   * What a wipe must never take, whatever the caller asked to keep.
   *
   * The publisher empties a volume the platform owns; this empties a directory the DEVELOPER
   * owns, and four things in it were never the platform's to delete. `.viable/` is how a later
   * session recognizes the project at all (and holds the local keypair and the run record);
   * `.env` and the web's `.env` carry the database URL and the identity the user typed, which
   * the platform cannot re-derive because it provisions nothing on a developer's machine; and
   * `.git` is their history. Losing any of them is a data loss no re-initialization is worth,
   * so the list is added to the caller's rather than offered to it.
   *
   * DELIBERATE DIFFERENCE from the publisher: because this set is never empty, the
   * `fs.emptyDir` fast path an absent `ignore` used to take can never be taken here. Every wipe
   * walks and prunes.
   */
  const alwaysKeep = (): string[] => [
    CONNECT_MARKER_DIR,
    '.env',
    `${layout().dir}/${dirOf(SubProject.Web)}/.env`,
    '.git',
  ]

  const helper = {
    /**
     * Wipe the project, keeping what the caller names and what is never ours to delete.
     *
     * The kept paths are project-relative and may be NESTED — `.agents/memory/history.md` is one
     * the reinit pipeline passes, and `sources/web/.env` is one this helper adds itself. Matching
     * them against top-level `readdir` names alone is what deleted the first: `.agents` matched
     * nothing in the ignore set, so the whole harness tree went along with the one file the
     * caller had explicitly asked to preserve — and nothing failed.
     *
     * So a directory is removed whole only when nothing kept lives under it; otherwise it is
     * walked and pruned entry by entry.
     */
    emptyProject: async (ignore?: string[]) => {
      const keep = new Set(
        [...(ignore ?? []), ...alwaysKeep()].map(entry => entry.replace(/^\.?\//, ''))
      )
      const isKept = (rel: string) => keep.has(rel)
      // Something kept lives below here, so this directory has to be walked rather than removed.
      const holdsKept = (rel: string) => {
        const prefix = `${rel}/`
        for (const entry of keep) {
          if (entry.startsWith(prefix)) return true
        }

        return false
      }

      const prune = async (rel: string): Promise<void> => {
        const dir = rel === '' ? rootPath : p.join(rootPath, rel)
        const entries = await fs.readdir(dir)
        await Promise.all(entries.map(async name => {
          const child = rel === '' ? name : `${rel}/${name}`
          if (isKept(child)) {
            return
          }
          if (holdsKept(child)) {
            await prune(child)
            // The keep list names paths that need not exist — the web package's `.env` is one
            // every project without local branding lacks. A directory walked only for a keep that
            // was not there must not survive as an empty shell, or a wipe leaves a skeleton of
            // the tree it removed and the install that follows lands in a half-populated one.
            const remaining = await fs.readdir(p.join(rootPath, child))
            if (remaining.length === 0) {
              await fs.remove(p.join(rootPath, child))
            }

            return
          }
          await fs.remove(p.join(rootPath, child))
        }))
      }

      await fs.ensureDir(rootPath)
      await prune('')
    },

    deleteProject: async () => {
      await helper.emptyProject()
    },

    /**
     * Finish an installed template: make sure the root manifest declares its workspaces.
     *
     * The agent pushes every template file itself, so this is only the finalizer. The workspace
     * list is written only when the manifest does not already declare one — the template ships
     * `["sources/*"]`, and injecting the explicit list beside it produced a manifest carrying the
     * key TWICE, valid only because JSON keeps the last one.
     */
    initializeProject: async () => {
      const manifestPath = `${rootPath}package.json`
      if (await fs.pathExists(manifestPath) === false) {
        return
      }
      const file = await fs.readFile(manifestPath, 'utf-8')
      if (/"workspaces"\s*:/.test(file)) {
        return
      }

      const { dir, build } = layout()
      const present: string[] = []
      for (const pkg of build) {
        if (await fs.pathExists(`${rootPath}${p.join(dir, pkg, 'package.json')}`)) {
          present.push(p.join(dir, pkg))
        }
      }

      await fs.writeFile(manifestPath, file.replace(`"type": "module",`, `
        "type": "module",
        "workspaces": [
${present.map(path => `          "${path}"`).join(',\n')}
        ],
      `))
    },

    getSourceList: async (
      pattern = `${rootPath}**/*`,
      options: SourceListOptions = {}
    ): Promise<string[]> => {
      const { skipUIElements = false, excludes = [] } = options
      pattern = pattern.startsWith(rootPath) ? pattern : p.join(rootPath, pattern)

      const files = await globby([
        pattern,
        `!${rootPath}**/rollup.config.js`,
        `!${rootPath}**/rollup.build.mjs`,
        // bunfig.toml is pure infra (identical to the template); excluded so an LLM fixer cannot
        // corrupt it with an invalid `[run] shell`, which breaks every `bun install`.
        `!${rootPath}**/bunfig.toml`,
        // Legacy drizzle-kit output. The target no longer emits it — tables come from the
        // resources' AJV schemas — but a tree generated before that switch may still carry some,
        // and it is not source an LLM should read or edit.
        `!${rootPath}**/db/migrations/**`,
        // Dependency lockfiles — generated, never hand-fixable, and huge: a target's `bun.lock`
        // alone overflows a model's context window, and every retry then fails identically. The
        // target installs with bun, but every manager's lockfile is listed — an LLM-authored
        // `package.json` edit can switch the target's toolchain.
        `!${rootPath}**/bun.lock`,
        `!${rootPath}**/bun.lockb`,
        `!${rootPath}**/yarn.lock`,
        `!${rootPath}**/package-lock.json`,
        `!${rootPath}**/pnpm-lock.yaml`,
        `!${rootPath}**/dist/**/*`,
        `!${rootPath}**/build/**/*`,
        `!${rootPath}**/node_modules/**/*`,
        `!${rootPath}spectator-log/**/*`,
        // The target's own documentation and agent harness, plus the co-located metadata files
        // (*.spec.md, *.ux.md, *.ui.md).
        ...METADATA_DIRS.map(dir => `!${rootPath}${dir}/**/*`),
        ...METADATA_SUFFIXES.map(suffix => `!${rootPath}**/*${suffix}`),
        ...excludes.map(exclude => `!${rootPath}${exclude}`),
        ...(skipUIElements
          ? [`!${rootPath}${layout().dir}/${dirOf(SubProject.Frontend)}/src/components/ui/**/*`]
          : [])
      ])

      return files.map(file => cleanUpPath(file, { rootPath }))
    },

    getStructuredList: async (patterns: string[]): Promise<string[]> => {
      const resolved = patterns.map(
        pattern => pattern.startsWith(rootPath) ? pattern : p.join(rootPath, pattern)
      )
      const files = await globby(resolved)

      return files.map(file => cleanUpPath(file, { rootPath }))
    },

    readFile: async (path: string, notThrow = false): Promise<string> => {
      try {
        return await fs.readFile(resolveInProject(path, { rootPath }), 'utf-8')
      } catch (e) {
        if (notThrow) {
          return ''
        }
        throw e
      }
    },

    readSource: async (filePath: string): Promise<LocalSourceFile> => {
      const path = cleanUpPath(filePath, { rootPath })
      const code = await fs.readFile(resolveInProject(path, { rootPath }), 'utf-8').catch(() => '')

      return { path, code }
    },

    readPossibleSource: async (filePath: string): Promise<LocalSourceFile> => {
      const source = await fs.readFile(resolveInProject(filePath, { rootPath }), 'utf-8')
        .catch(() => '')
      const path = cleanUpPath(filePath, { rootPath })

      return source === '' ? { path } : { path, code: source }
    },

    readSources: async (files: string | string[]): Promise<LocalSourceFile[]> => {
      const paths = normalizePaths(files, { rootPath })
      const results: LocalSourceFile[] = []
      for (const path of paths) {
        const code = await fs.readFile(resolveInProject(path, { rootPath }), 'utf-8')
          .catch(() => '')
        results.push({ path, code })
      }

      return results
    },

    writeFile: async (filePath: string, content: string): Promise<void> => {
      const path = resolveInProject(filePath, { rootPath })
      await fs.ensureDir(p.dirname(path))
      await fs.writeFile(path, content)
    },

    writeSource: async (file: { path: string, code: string }): Promise<void> => {
      const path = resolveInProject(file.path, { rootPath })
      await fs.ensureDir(p.dirname(path))
      await fs.writeFile(path, file.code)
    },

    deleteFile: async (filePath: string, noThrow = true): Promise<void> => {
      const path = resolveInProject(filePath, { rootPath })
      try {
        await fs.rm(path, { force: true, recursive: true })
      } catch (e) {
        if (!noThrow) {
          throw e
        }
      }
    },

    getRootPath: (subproject?: SubProject): string => subproject == null
      ? rootPath
      : p.join(rootPath, layout().dir, dirOf(subproject)),

    findFilesWithEnvVars: async (frontend?: boolean): Promise<string[]> => {
      const searchPattern = frontend === true
        ? `${rootPath}${layout().dir}/${dirOf(SubProject.Frontend)}/src/**/*.ts`
        : frontend === false
          ? `${rootPath}${layout().dir}/${dirOf(SubProject.Backend)}/src/**/*.ts`
          : `${rootPath}**/*.ts`

      const files = await globby([
        searchPattern,
        `!${rootPath}**/node_modules/**/*`,
        `!${rootPath}**/owlmeans.ts`,
        `!${rootPath}**/config.ts`,
        `!${rootPath}**/routes.ts`,
        `!${rootPath}**/router.ts`,
        `!${rootPath}**/index.ts`,
        `!${rootPath}spectator-log/**/*`,
      ])

      const result: string[] = []
      for (const fullPath of files) {
        const content = await fs.readFile(fullPath, 'utf-8').catch(() => '')
        if (content.match(/process\.env\??\./g)) {
          result.push(cleanUpPath(fullPath, { rootPath }))
        }
      }

      return result
    }
  }

  return helper
}

export type LocalFileHelper = ReturnType<typeof createLocalFileHelper>

const wrapWithSlashes = (path: string) => path.endsWith('/') ? path : `${path}/`

const cleanUpPath = (file: string, { rootPath }: { rootPath: string }) =>
  file.replace(rootPath, '').replace(/^\/+/, '')

/**
 * Resolve a caller-supplied project path to the absolute path it names inside the project.
 *
 * Paths arrive from the platform in both shapes — root-relative (`sources/web/src/app.tsx`) and
 * already absolute — so **every** fs call has to apply the same normalization, not just the read
 * side. Concatenating an absolute path onto the root instead builds a shadow tree: the write
 * reports success, a later read of the same name resolves to the untouched original, and the
 * change looks like it was silently ignored.
 *
 * The refusal is confinement, not sanitization: only a fully resolved path can be compared to the
 * root, and a `..`-to-`.` replace at one caller is a guard on that caller rather than on the tree.
 */
const resolveInProject = (file: string, { rootPath }: { rootPath: string }) => {
  const resolved = p.resolve(rootPath, cleanUpPath(file, { rootPath }))
  const root = p.resolve(rootPath)

  if (resolved !== root && !resolved.startsWith(wrapWithSlashes(root))) {
    throw new SandboxPathError(file)
  }

  return resolved
}

const normalizePaths = (files: string | string[], { rootPath }: { rootPath: string }) => {
  const fileList = Array.isArray(files) ? files : [files]

  return fileList.map(file => file.startsWith('/') ? cleanUpPath(file, { rootPath }) : file)
}

/**
 * The same confinement, for callers outside this helper.
 *
 * Exported because the configure push writes `.env` files by name and a path is a path: a guard
 * that only the file commands apply is a guard on the file commands, and the connector holds the
 * developer's home directory rather than a pod's volume.
 */
export const confineToProject = (dir: string, file: string): string =>
  resolveInProject(file, { rootPath: wrapWithSlashes(p.resolve(dir)) })
