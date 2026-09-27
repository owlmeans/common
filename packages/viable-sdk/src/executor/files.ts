import fs from 'fs-extra'
import { globby } from 'globby'
import fsp from 'node:fs/promises'
import p from 'node:path'

import {
  binaryByExtension, BINARY_PROBE_BYTES, CENSUS_MAX_ENTRIES, CENSUS_MAX_HEAD_BYTES,
  CENSUS_SKIP_DIRS, CONNECT_MARKER_DIR, METADATA_SUFFIXES, SOURCE_LIST_EXCLUSIONS, SubProject
} from '@owlmeans/viable-common'
import type { FileStat, StatTreeResult } from '@owlmeans/viable-common'

import { FileCommandRefused, SandboxPathError } from './errors.js'
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
 * What a tree walk never descends into.
 *
 * {@link CENSUS_SKIP_DIRS} is the shared half — the two directories that are never the repository
 * in any tree, spread from `@owlmeans/viable-common` rather than restated, because the publisher
 * and the library-local helper walk the SAME question and a caller cannot tell which executor
 * produced the listing it is holding. This one used to add `dist`, `build` and `.next` on top,
 * which are ordinary directory names an origin may keep sources in: the same repository then had
 * one `total` here and another one in the slot.
 *
 * {@link CONNECT_MARKER_DIR} is added for a reason that belongs to this executor alone: it is THIS
 * CONNECTOR's directory, not the origin's. It holds the local key pair and the run record and
 * never a line of the application, while a census exists to be followed by a `readHead` of what it
 * listed — and nothing downstream knows which of the two wrote a path.
 */
const WALK_SKIP = new Set([...CENSUS_SKIP_DIRS, CONNECT_MARKER_DIR])

/**
 * Whether a file is binary, by git's own heuristic: a NUL byte near the beginning.
 *
 * Asked only where {@link binaryByExtension} says nothing, and that ordering is the contract
 * rather than an optimization: a probe alone answers `false` for a small `.ico` with no NUL in its
 * first bytes, so a census run here and the same census run in the slot disagreed about one file
 * of one repository — with the tail table consulted first, all three executors agree.
 */
const isBinary = async (path: string, size: number): Promise<boolean> => {
  if (size < 1) return false
  const handle = await fsp.open(path, 'r').catch(() => null)
  if (handle == null) return false
  try {
    const length = Math.min(size, BINARY_PROBE_BYTES)
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)

    return buffer.subarray(0, bytesRead).includes(0)
  } catch {
    return false
  } finally {
    await handle.close()
  }
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

  /**
   * The two questions a wipe and a relocation both ask of every entry they walk.
   *
   * Shared because they are the same walk with a different verb: one removes what it passes and
   * the other moves it, and both must leave a nested keep — `.agents/memory/history.md`,
   * `sources/web/.env` — where it is. Matching kept paths against top-level names alone is what
   * once deleted a whole harness tree along with the one file the caller had asked to preserve.
   */
  const keepGuards = (entries: readonly string[]) => {
    const keep = new Set(entries.map(entry => entry.replace(/^\.?\//, '').replace(/\/+$/, '')))
    const holdsKept = (rel: string): boolean => {
      const prefix = `${rel}/`
      for (const entry of keep) {
        if (entry.startsWith(prefix)) return true
      }

      return false
    }

    return { keep, isKept: (rel: string) => keep.has(rel), holdsKept }
  }

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
      // `holdsKept` says something kept lives below here, so this directory has to be walked
      // rather than removed.
      const { isKept, holdsKept } = keepGuards([...(ignore ?? []), ...alwaysKeep()])

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
        // The target's own documentation and agent harness, and the origin tree a conversion
        // keeps beside the generated application — ONE constant, shared with the publisher and
        // the library, because three copies of this list is three chances for one of them to
        // keep listing the origin, and the symptom is a coder helper reading a foreign
        // framework's files as if they were the target's. Plus the co-located metadata files
        // (*.spec.md, *.ux.md, *.ui.md).
        ...SOURCE_LIST_EXCLUSIONS.map(dir => `!${rootPath}${dir}/**/*`),
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

    /**
     * The tree, one line per file, bounded.
     *
     * One command rather than a listing plus a read per entry: the caller is a census over a
     * repository somebody else wrote, which may hold a hundred thousand files, and one round trip
     * each — over a connector, on somebody's laptop — is not a slower walk but a walk that never
     * finishes.
     *
     * `total` counts what the walk SAW and `entries` what it returned. They differ once the limit
     * is reached, and that difference is the only thing that tells a caller its picture of the
     * tree is partial: a listing that reported only its own length would be indistinguishable
     * from a small repository.
     *
     * Every entry's `path` is relative to the directory ASKED FOR, not to the project root. That
     * is the contract the in-process helper and the publisher answer, and one executor answering
     * a different relativity is worse than either choice: the caller is a census that follows a
     * listing with a `readHead` of what it listed, and nothing downstream knows which of the
     * three produced the path it is holding.
     */
    statTree: async (dir?: string, limit?: number): Promise<StatTreeResult> => {
      const start = dir != null && dir !== ''
        ? resolveInProject(dir, { rootPath })
        : p.resolve(rootPath)
      const cap = limit != null && limit > 0 ? limit : CENSUS_MAX_ENTRIES
      const entries: FileStat[] = []
      let total = 0

      const walk = async (absolute: string): Promise<void> => {
        const listed = await fs.readdir(absolute, { withFileTypes: true }).catch(() => [])
        for (const entry of listed) {
          if (WALK_SKIP.has(entry.name)) continue
          const child = p.join(absolute, entry.name)
          if (entry.isDirectory()) {
            await walk(child)

            continue
          }
          // Symlinks and devices are counted by nobody: a census describes files a model could
          // read, and following a link would leave the tree it was asked about.
          if (!entry.isFile()) continue
          total += 1
          if (entries.length >= cap) continue
          const stat = await fs.stat(child).catch(() => null)
          if (stat == null) continue
          const rel = p.relative(start, child)
          const known = binaryByExtension(rel)
          entries.push({
            path: rel,
            bytes: stat.size,
            binary: known ?? await isBinary(child, stat.size),
            modifiedAt: stat.mtime.toISOString(),
          })
        }
      }

      await walk(start)

      return { entries, truncated: total > entries.length, total }
    },

    /**
     * The first bytes of one file, decoded as text.
     *
     * A classification reads a head; reading whole files to do it would hold a megabyte export in
     * memory to look at its first line. Whatever the decoding produces for a binary head is the
     * answer — that IS the signal an entropy classification wants, and cleaning it up would hide
     * the one thing the caller is asking about.
     */
    readHead: async (filePath: string, bytes: number): Promise<string> => {
      // Confinement first, and it is the ONE thing here that still raises: a path resolving
      // outside the project is a caller's bug, never an entry of a tree.
      const path = resolveInProject(filePath, { rootPath })
      // Everything else answers `''`. A census hands this whatever a walk over somebody else's
      // tree produced — a directory, a symlink, a file deleted between the listing and the read —
      // and one unreadable entry must not fail the pass that is classifying the rest. A directory
      // is the case that made this necessary: `open` succeeds on one and the read then throws
      // EISDIR, so the tolerant answer has to cover the read as well as the open.
      const stat = await fs.stat(path).catch(() => null)
      if (stat == null || !stat.isFile()) return ''
      const length = Math.min(Math.max(bytes, 0), stat.size, CENSUS_MAX_HEAD_BYTES)
      if (length < 1) return ''
      const handle = await fsp.open(path, 'r').catch(() => null)
      if (handle == null) return ''
      try {
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, 0)

        return buffer.subarray(0, bytesRead).toString('utf-8')
      } catch {
        return ''
      } finally {
        await handle.close()
      }
    },

    /**
     * Move everything in the project root under one directory, leaving a named few where they are.
     *
     * What makes a converted project possible: the origin's own tree goes below, a Viable target
     * is grown above it, and the two never share a path. It is the same walk `emptyProject` does —
     * kept paths may be nested, a directory holding one is walked rather than moved, and a
     * directory left empty by that walk does not survive as a shell.
     *
     * The always-keep set applies here too and for the same reason: `.git` is the developer's
     * history and moving it under the origin would take the project's whole history with it,
     * `.viable` is how a later session recognizes the project, and the two `.env` files hold what
     * the platform cannot re-derive.
     *
     * Refuses a destination that already holds something. A relocation into an occupied directory
     * interleaves two trees, and nothing afterwards can tell which files came from where.
     */
    relocate: async (dir: string, keep?: string[]): Promise<{ moved: number, kept: string[] }> => {
      // Resolved FIRST, and the project-relative name derived back from the resolved path. A
      // destination arrives in both shapes like every other path a caller sends, and normalizing
      // the string ahead of the confinement is what builds the shadow tree `resolveInProject`
      // exists to prevent: an absolute destination lost its leading slash, resolved under the root
      // a second time, and the keep set then no longer matched the top-level name it had created.
      // It also subsumes `.`, `''` and a trailing slash, which all resolve to the root itself.
      const destinationPath = resolveInProject(dir ?? '', { rootPath })
      const destination = p.relative(p.resolve(rootPath), destinationPath)
      if (destination === '') {
        throw new FileCommandRefused('relocate needs a directory to move the project into')
      }
      if (await fs.pathExists(destinationPath)) {
        const existing = await fs.readdir(destinationPath)
        if (existing.length > 0) {
          throw new FileCommandRefused(`relocation target is not empty: ${destination}`)
        }
      }

      // The destination is kept like anything else, which is what stops the walk moving it into
      // itself — a keep is checked before a move, and this one always matches first.
      const { keep: kept, isKept, holdsKept } = keepGuards(
        [destination, ...(keep ?? []), ...alwaysKeep()]
      )

      const move = async (rel: string): Promise<number> => {
        const from = rel === '' ? rootPath : p.join(rootPath, rel)
        const entries = await fs.readdir(from)
        let moved = 0
        // Serial: a relocation is one operation from the caller's point of view, and a half-moved
        // tree is neither the origin nor a target.
        for (const name of entries) {
          const child = rel === '' ? name : `${rel}/${name}`
          if (isKept(child)) continue
          if (holdsKept(child)) {
            moved += await move(child)
            const remaining = await fs.readdir(p.join(rootPath, child))
            if (remaining.length === 0) await fs.remove(p.join(rootPath, child))

            continue
          }
          const to = p.join(destinationPath, child)
          await fs.ensureDir(p.dirname(to))
          await fs.move(p.join(rootPath, child), to)
          moved += 1
        }

        return moved
      }

      await fs.ensureDir(destinationPath)
      const moved = await move('')

      // The whole keep set, exactly as the publisher and the library helper answer it — this is a
      // report of what the relocation was told to leave alone, not a listing of what happens to be
      // on disk afterwards. Filtering it by existence made the same relocation answer differently
      // here than in a slot, over paths (a project without local branding has no web `.env`) whose
      // absence says nothing about the move.
      return { moved, kept: [...kept] }
    },

    /**
     * Delete a directory and everything under it — the purge of a relocated origin.
     *
     * Refuses the project root: emptying the project is `emptyProject`, which has a keep list this
     * does not, and a purge that resolved to `.` would take the developer's `.git` and `.env` with
     * the origin it was asked to remove.
     */
    removeTree: async (dir: string): Promise<void> => {
      const path = resolveInProject(dir, { rootPath })
      if (path === p.resolve(rootPath)) {
        throw new FileCommandRefused('removeTree cannot delete the project root')
      }
      await fs.remove(path)
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
