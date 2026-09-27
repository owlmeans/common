import { afterEach, describe, expect, test } from 'bun:test'
import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'

import { SubProject, TargetLayout } from '@owlmeans/viable-common'

import {
  apiPath, detectLayout, hasWorker, libraryPaths, subprojectDir, targetPaths, webPath, workerPath
} from '../src/executor/layout.js'

/**
 * Which tree the connector's directory actually holds.
 *
 * The target project moved from `packages/{common,backend,frontend}` to
 * `sources/{common,backend,api,web,worker}`, and the two are not a rename: v2's `backend` is a
 * library and its server is `api`. Nothing migrates a tree, so a project generated before the move
 * stays v1 for its whole life and the connector has to answer for the one in front of it — a wrong
 * answer is a `cwd` that does not exist, which surfaces as a `posix_spawn` ENOENT blaming the
 * toolchain.
 *
 * Platform vs target: the trees built here are TARGET projects (test data), not this repo.
 */
describe('viable-sdk — target layout detection', () => {
  const roots: string[] = []

  const sandbox = async (dirs: string[]): Promise<string> => {
    const root = await fse.mkdtemp(path.join(os.tmpdir(), 'viable-sdk-layout-'))
    roots.push(root)
    for (const dir of dirs) await fse.ensureDir(path.join(root, dir))

    return root
  }

  afterEach(async () => {
    while (roots.length > 0) await fse.remove(roots.pop() as string)
  })

  test('a v1 tree resolves the packages layout', async () => {
    const root = await sandbox(['packages/common', 'packages/backend', 'packages/frontend'])

    expect(detectLayout(root)).toBe(TargetLayout.V1)
    expect(apiPath(root)).toBe(path.join(root, 'packages', 'backend'))
    expect(webPath(root)).toBe(path.join(root, 'packages', 'frontend'))
  })

  test('a v2 tree resolves api as the server and web as the browser app', async () => {
    // The trap the marker exists for: v2 still HAS a `backend`, and it is a library nothing
    // spawns. Resolving the server to it would start a package with no `dist/index.js`.
    const root = await sandbox([
      'sources/common', 'sources/backend', 'sources/api', 'sources/web', 'sources/worker',
    ])

    expect(detectLayout(root)).toBe(TargetLayout.V2)
    expect(apiPath(root)).toBe(path.join(root, 'sources', 'api'))
    expect(webPath(root)).toBe(path.join(root, 'sources', 'web'))
    expect(targetPaths(root).build).toEqual(['common', 'backend', 'api', 'web', 'worker'])
  })

  test('an empty directory answers v1, which is what every path resolved to before v2 existed', async () => {
    const root = await sandbox([])

    expect(detectLayout(root)).toBe(TargetLayout.V1)
  })

  test('a re-initialized tree is re-read, never remembered', async () => {
    // A project is re-initialized in place under a running connector. A memoized verdict would
    // keep resolving every path into a directory that had just been deleted.
    const root = await sandbox(['packages/backend', 'packages/frontend'])
    expect(detectLayout(root)).toBe(TargetLayout.V1)

    await fse.remove(path.join(root, 'packages'))
    await fse.ensureDir(path.join(root, 'sources', 'api'))

    expect(detectLayout(root)).toBe(TargetLayout.V2)
  })

  test('a wire subproject is a role, and each layout spells it differently', async () => {
    const v1 = await sandbox(['packages/backend'])
    const v2 = await sandbox(['sources/api'])

    expect(subprojectDir(v1, SubProject.Backend)).toBe('backend')
    expect(subprojectDir(v1, SubProject.Frontend)).toBe('frontend')
    // v2 SPLIT the server: `backend` is the shared library and `api` is the HTTP server, which is
    // what the agent library means by each name. Resolving `backend` to `api` here would
    // type-check and build the server whenever the platform asked about the library.
    expect(subprojectDir(v2, SubProject.Backend)).toBe('backend')
    expect(subprojectDir(v2, SubProject.Frontend)).toBe('web')
    expect(subprojectDir(v2, SubProject.Common)).toBe('common')
  })

  test('every role the platform can send resolves, and none but Common answers common', async () => {
    // The regression this pins: a role enum that held v1's three names while the sender had moved
    // to five, with a fall-through answering `common` for everything it did not know. So
    // `getRootPath('web')` and `validate('api')` silently addressed the shared package — a wrong
    // answer that nothing reported, because `common` is a real directory.
    const v1 = await sandbox(['packages/backend'])
    const v2 = await sandbox(['sources/api'])

    for (const role of Object.values(SubProject).filter(r => r !== SubProject.Common)) {
      expect(subprojectDir(v1, role)).not.toBe('common')
      expect(subprojectDir(v2, role)).not.toBe('common')
    }
    expect(subprojectDir(v1, SubProject.Common)).toBe('common')
    expect(subprojectDir(v2, SubProject.Common)).toBe('common')

    // The v2 names map onto v1's directories, so a current platform still reaches an old tree.
    expect(subprojectDir(v1, SubProject.Api)).toBe('backend')
    expect(subprojectDir(v1, SubProject.Web)).toBe('frontend')
    expect(subprojectDir(v2, SubProject.Api)).toBe('api')
    expect(subprojectDir(v2, SubProject.Web)).toBe('web')
    expect(subprojectDir(v2, SubProject.Worker)).toBe('worker')
  })

  test('the libraries a tree must build before anything that imports them', async () => {
    // Every bundled package keeps its dependencies external, so `<slug>-backend` is resolved from
    // node_modules at RUN time and followed to `build/index.js`. Nothing else builds it — the api,
    // web and worker builds each run inside their own directory — and the target then exits 1
    // with `Cannot find package`, a message about a dependency for a build that never happened.
    const v1 = await sandbox(['packages/common', 'packages/backend', 'packages/frontend'])
    const v2 = await sandbox(['sources/common', 'sources/backend', 'sources/api', 'sources/web'])

    expect(libraryPaths(v1)).toEqual([path.join(v1, 'packages', 'common')])
    // Ordered: `backend` compiles against `common`.
    expect(libraryPaths(v2)).toEqual([
      path.join(v2, 'sources', 'common'),
      path.join(v2, 'sources', 'backend'),
    ])
  })

  test('a library that is not on disk is not built', async () => {
    const root = await sandbox(['sources/api', 'sources/common'])

    expect(libraryPaths(root)).toEqual([path.join(root, 'sources', 'common')])
  })

  test('a v1 tree has nowhere a worker could live', async () => {
    const root = await sandbox(['packages/common', 'packages/backend', 'packages/frontend'])

    expect(workerPath(root)).toBeNull()
    expect(hasWorker(root)).toBe(false)
  })

  test('a v2 tree names the worker whether or not one is there', async () => {
    const root = await sandbox(['sources/common', 'sources/api', 'sources/web'])

    expect(workerPath(root)).toBe(path.join(root, 'sources', 'worker'))
    expect(hasWorker(root)).toBe(false)
  })

  test('a worker counts only once its package manifest is on disk', async () => {
    // The directory alone is what a half-finished install leaves behind, and supervising a package
    // with nothing in it spends a start on a bundle that cannot exist yet.
    const root = await sandbox(['sources/common', 'sources/api', 'sources/web', 'sources/worker'])

    expect(hasWorker(root)).toBe(false)

    await fse.writeJSON(path.join(root, 'sources', 'worker', 'package.json'), { name: 'worker' })

    expect(hasWorker(root)).toBe(true)
  })
})
