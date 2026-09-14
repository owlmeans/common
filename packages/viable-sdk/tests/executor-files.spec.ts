import { afterEach, describe, expect, test } from 'bun:test'
import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'

import { CONVERTED_ORIGIN_DIR, SubProject } from '@owlmeans/viable-common'

import { FileCommandRefused, SandboxPathError } from '../src/executor/errors.js'
import { createLocalFileHelper } from '../src/executor/files.js'

/**
 * The file half of the local executor, against real trees.
 *
 * Two things here are the whole reason this file exists. The confinement, because the connector
 * holds a developer's home directory rather than a pod's volume — a path that escapes writes into
 * their machine. And the keep list, because `emptyProject` is what a re-initialization runs, and
 * on a local tree it would otherwise delete the marker, the database URL and the history that
 * were never the platform's to remove.
 *
 * Platform vs target: everything built here is a TARGET project (test data).
 */
describe('viable-sdk — local file helper', () => {
  const roots: string[] = []

  const sandbox = async (files: Record<string, string> = {}): Promise<string> => {
    const root = await fse.mkdtemp(path.join(os.tmpdir(), 'viable-sdk-files-'))
    roots.push(root)
    for (const [file, content] of Object.entries(files)) {
      await fse.ensureDir(path.join(root, path.dirname(file)))
      await fse.writeFile(path.join(root, file), content)
    }

    return root
  }

  afterEach(async () => {
    while (roots.length > 0) await fse.remove(roots.pop() as string)
  })

  describe('path confinement', () => {
    test('a relative path that climbs out is refused', async () => {
      const root = await sandbox()
      const helper = createLocalFileHelper(root)

      expect(helper.writeFile('../escaped.txt', 'x')).rejects.toThrow(SandboxPathError)
      expect(helper.readFile('sources/../../etc/passwd')).rejects.toThrow(SandboxPathError)
      expect(helper.deleteFile('../../anything', false)).rejects.toThrow(SandboxPathError)
    })

    test('an absolute path elsewhere on the machine lands inside the project, never at its own name', async () => {
      // The confinement is not a rejection of every absolute path — the platform legitimately
      // sends already-resolved ones — it is the guarantee that nothing resolves OUTSIDE. A path
      // that names another part of the filesystem is re-rooted, so the worst it can do is create
      // a junk file in the project; what it can never do is write to `/etc`.
      const root = await sandbox()
      const helper = createLocalFileHelper(root)

      await helper.writeFile('/etc/hosts', 'x')

      expect(await fse.pathExists(path.join(root, 'etc', 'hosts'))).toBe(true)
      expect(await fse.readFile('/etc/hosts', 'utf-8')).not.toBe('x')
    })

    test('an absolute path INSIDE the project resolves rather than building a shadow tree', async () => {
      // Paths arrive in both shapes. Concatenating an absolute one onto the root instead produces
      // `<root>/<root>/…`: the write reports success, a later read of the same name resolves to
      // the untouched original, and the change looks like it was silently ignored.
      const root = await sandbox()
      const helper = createLocalFileHelper(root)

      await helper.writeFile(path.join(root, 'sources/web/src/app.tsx'), 'export const app = 1')

      expect(await fse.pathExists(path.join(root, 'sources/web/src/app.tsx'))).toBe(true)
      expect(await fse.pathExists(path.join(root, root))).toBe(false)
      expect(await helper.readFile('sources/web/src/app.tsx')).toBe('export const app = 1')
    })

    test('a read that is allowed to fail answers empty rather than throwing', async () => {
      const root = await sandbox()
      const helper = createLocalFileHelper(root)

      expect(await helper.readFile('nothing/here.ts', true)).toBe('')
      expect(await helper.readPossibleSource('nothing/here.ts')).toEqual({ path: 'nothing/here.ts' })
    })
  })

  describe('emptyProject', () => {
    test('a nested keep survives, and so does the directory holding it', async () => {
      // `.agents` matched nothing in a top-level ignore set, so the whole harness tree went along
      // with the one file the caller had explicitly asked to preserve — and nothing failed.
      const root = await sandbox({
        '.agents/memory/history.md': 'what happened',
        '.agents/skills/x/SKILL.md': 'a skill',
        'sources/api/src/index.ts': 'x',
        'package.json': '{}',
      })

      await createLocalFileHelper(root).emptyProject(['.agents/memory/history.md'])

      expect(await fse.pathExists(path.join(root, '.agents/memory/history.md'))).toBe(true)
      expect(await fse.pathExists(path.join(root, '.agents/skills/x/SKILL.md'))).toBe(false)
      expect(await fse.pathExists(path.join(root, 'sources'))).toBe(false)
      expect(await fse.pathExists(path.join(root, 'package.json'))).toBe(false)
    })

    test('the marker, both env files and the history are kept even when nothing was asked', async () => {
      // The always-keep list, and the reason the `fs.emptyDir` fast path can never be taken here:
      // a wipe that took the developer's database URL, their git history or the marker that says
      // which project this is would be a data loss the platform has no way to undo.
      const root = await sandbox({
        '.viable/connect.json': '{"projectId":"p1"}',
        '.env': 'DATABASE_URL=postgres://localhost/app',
        'sources/web/.env': 'BRANDING_PRODUCT=Thing',
        '.git/HEAD': 'ref: refs/heads/main',
        'sources/api/src/index.ts': 'x',
        'README.md': '# gone',
      })

      await createLocalFileHelper(root).emptyProject()

      expect(await fse.pathExists(path.join(root, '.viable/connect.json'))).toBe(true)
      expect(await fse.pathExists(path.join(root, '.env'))).toBe(true)
      expect(await fse.pathExists(path.join(root, 'sources/web/.env'))).toBe(true)
      expect(await fse.pathExists(path.join(root, '.git/HEAD'))).toBe(true)
      expect(await fse.pathExists(path.join(root, 'sources/api'))).toBe(false)
      expect(await fse.pathExists(path.join(root, 'README.md'))).toBe(false)
    })

    test('a v1 tree keeps ITS web env, not v2\'s', async () => {
      // The kept path is resolved through the layout rather than spelled out, because a project
      // generated before the move calls the browser package `frontend` for the rest of its life.
      const root = await sandbox({
        'packages/frontend/.env': 'BACKEND_HOST=localhost',
        'packages/backend/src/index.ts': 'x',
      })

      await createLocalFileHelper(root).emptyProject()

      expect(await fse.pathExists(path.join(root, 'packages/frontend/.env'))).toBe(true)
      expect(await fse.pathExists(path.join(root, 'packages/backend'))).toBe(false)
    })
  })

  describe('source listing', () => {
    test('generated, vendored and metadata files are all excluded', async () => {
      const root = await sandbox({
        'sources/api/src/index.ts': 'export const x = 1',
        'sources/web/src/app.tsx': 'export const App = () => null',
        'sources/api/src/app.spec.md': 'a specification',
        'sources/api/rollup.config.js': 'export default {}',
        'sources/api/rollup.build.mjs': 'build()',
        'bunfig.toml': '[install]\nlinker = "hoisted"',
        'bun.lock': '{}',
        'package-lock.json': '{}',
        'sources/api/dist/index.js': 'bundled',
        'sources/common/build/index.js': 'compiled',
        'node_modules/left-pad/index.js': 'module.exports = 1',
        'docs/brief.md': 'the brief',
        'spectator-log/trace.json': '{}',
      })

      const listed = await createLocalFileHelper(root).getSourceList()

      expect(listed).toContain('sources/api/src/index.ts')
      expect(listed).toContain('sources/web/src/app.tsx')
      for (const excluded of [
        'sources/api/src/app.spec.md', 'sources/api/rollup.config.js',
        'sources/api/rollup.build.mjs', 'bunfig.toml', 'bun.lock', 'package-lock.json',
        'sources/api/dist/index.js', 'sources/common/build/index.js',
        'node_modules/left-pad/index.js', 'docs/brief.md', 'spectator-log/trace.json',
      ]) {
        expect(listed).not.toContain(excluded)
      }
    })

    test('the origin a conversion keeps is not source of the generated application', async () => {
      // ONE exclusion constant, shared with the publisher and the library. A copy that forgot the
      // origin has a coder helper reading a foreign framework's files as if they were the
      // target's — and then editing them.
      const root = await sandbox({
        'sources/api/src/index.ts': 'export const x = 1',
        [`${CONVERTED_ORIGIN_DIR}/app/page.tsx`]: 'export default () => null',
        [`${CONVERTED_ORIGIN_DIR}/package.json`]: '{}',
      })

      const listed = await createLocalFileHelper(root).getSourceList()

      expect(listed).toContain('sources/api/src/index.ts')
      expect(listed).not.toContain(`${CONVERTED_ORIGIN_DIR}/app/page.tsx`)
      expect(listed).not.toContain(`${CONVERTED_ORIGIN_DIR}/package.json`)
    })

    test('a caller may exclude more, and skip the vendored UI primitives', async () => {
      const root = await sandbox({
        'sources/web/src/components/ui/button.tsx': 'shadcn',
        'sources/web/src/components/own.tsx': 'ours',
        'sources/api/src/index.ts': 'x',
      })
      const helper = createLocalFileHelper(root)

      const withUi = await helper.getSourceList()
      expect(withUi).toContain('sources/web/src/components/ui/button.tsx')

      const withoutUi = await helper.getSourceList(undefined, { skipUIElements: true })
      expect(withoutUi).not.toContain('sources/web/src/components/ui/button.tsx')
      expect(withoutUi).toContain('sources/web/src/components/own.tsx')

      const narrowed = await helper.getSourceList(undefined, { excludes: ['sources/api/**/*'] })
      expect(narrowed).not.toContain('sources/api/src/index.ts')
    })

    test('a structured list applies the caller\'s patterns and nothing else', async () => {
      const root = await sandbox({
        'sources/api/src/index.ts': 'x',
        'sources/web/src/app.tsx': 'y',
      })

      const listed = await createLocalFileHelper(root).getStructuredList(['sources/web/**/*.tsx'])

      expect(listed).toEqual(['sources/web/src/app.tsx'])
    })

    test('files reading process.env are found, and the wiring sources are not', async () => {
      const root = await sandbox({
        'sources/api/src/mailer.ts': 'const key = process.env.MAIL_KEY',
        'sources/api/src/config.ts': 'export const host = process.env.BACKEND_HOST',
        'sources/api/src/plain.ts': 'export const x = 1',
      })

      const found = await createLocalFileHelper(root).findFilesWithEnvVars()

      expect(found).toContain('sources/api/src/mailer.ts')
      // `config.ts` is where env vars BELONG; reporting it would send a fixer to rewrite wiring.
      expect(found).not.toContain('sources/api/src/config.ts')
      expect(found).not.toContain('sources/api/src/plain.ts')
    })
  })

  describe('roots and initialization', () => {
    test('a role resolves to its own package root', async () => {
      const root = await sandbox({ 'sources/api/package.json': '{}' })
      const helper = createLocalFileHelper(root)

      expect(helper.getRootPath()).toBe(`${root}/`)
      expect(helper.getRootPath(SubProject.Api)).toBe(path.join(root, 'sources', 'api'))
      expect(helper.getRootPath(SubProject.Backend)).toBe(path.join(root, 'sources', 'backend'))
    })

    test('the workspace list is written once, and never beside one already declared', async () => {
      // Injecting it beside the template's own produced a manifest carrying the key TWICE, valid
      // only because JSON keeps the last one.
      const root = await sandbox({
        'package.json': '{\n  "name": "project",\n  "type": "module",\n}',
        'sources/common/package.json': '{}',
        'sources/api/package.json': '{}',
      })
      const helper = createLocalFileHelper(root)

      await helper.initializeProject()
      const written = await fse.readFile(path.join(root, 'package.json'), 'utf-8')
      expect(written).toContain('"workspaces"')
      expect(written).toContain('"sources/common"')
      expect(written).toContain('"sources/api"')
      // Only what is actually on disk.
      expect(written).not.toContain('"sources/worker"')

      await helper.initializeProject()
      const again = await fse.readFile(path.join(root, 'package.json'), 'utf-8')
      expect(again).toBe(written)
    })

    test('a directory with no manifest is left alone', async () => {
      const root = await sandbox()

      await createLocalFileHelper(root).initializeProject()

      expect(await fse.pathExists(path.join(root, 'package.json'))).toBe(false)
    })
  })

  describe('reading a tree that somebody else wrote', () => {
    test('a listing carries a size and a binary verdict, and skips only what is never the tree', async () => {
      const root = await sandbox({
        'app/page.tsx': 'export default () => null',
        'app/data.json': '{"a":1}',
        'node_modules/left-pad/index.js': 'module.exports = 1',
        // NOT skipped: `dist`, `build` and `.next` are ordinary directory names an origin may keep
        // sources in, and skipping them here while the publisher walked them gave one repository
        // two different totals depending on which executor answered.
        'dist/bundle.js': 'bundled',
        '.git/HEAD': 'ref: refs/heads/main',
        // The connector's OWN directory, holding its key pair and its run record. A census is
        // followed by a readHead of what it listed, and nothing downstream knows that this one is
        // ours rather than the origin's.
        '.viable/connect.json': '{"projectId":"p1"}',
      })
      await fse.writeFile(path.join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x01]))
      // No tail to go on, so this one is the case the probe still answers.
      await fse.writeFile(path.join(root, 'archive'), Buffer.from([0x1f, 0x8b, 0x00, 0x02]))
      // A tail the table knows and a probe would get wrong: no NUL in the first bytes.
      await fse.writeFile(path.join(root, 'favicon.ico'), 'GIF89a')

      const { entries, truncated, total } = await createLocalFileHelper(root).statTree()
      const paths = entries.map(entry => entry.path).sort()

      expect(paths).toEqual([
        'app/data.json', 'app/page.tsx', 'archive', 'dist/bundle.js', 'favicon.ico', 'logo.png',
      ])
      expect(truncated).toBe(false)
      expect(total).toBe(6)
      expect(entries.find(entry => entry.path === 'logo.png')?.binary).toBe(true)
      expect(entries.find(entry => entry.path === 'app/page.tsx')?.binary).toBe(false)
      expect(entries.find(entry => entry.path === 'app/page.tsx')?.bytes).toBe(25)
      // The tail decides where it can, and the probe only where it cannot — the same order the
      // publisher and the library helper apply, so the three answer one verdict per file.
      expect(entries.find(entry => entry.path === 'favicon.ico')?.binary).toBe(true)
      expect(entries.find(entry => entry.path === 'archive')?.binary).toBe(true)
    })

    test('a bounded walk reports what it saw, not only what it returned', async () => {
      // The difference is the only thing that tells a caller its picture is partial; a listing
      // that reported its own length would be indistinguishable from a small repository.
      const files: Record<string, string> = {}
      for (let i = 0; i < 12; ++i) files[`src/f${i}.ts`] = 'x'

      const { entries, truncated, total } = await createLocalFileHelper(await sandbox(files))
        .statTree(undefined, 5)

      expect(entries).toHaveLength(5)
      expect(truncated).toBe(true)
      expect(total).toBe(12)
    })

    test('a walk can start below the root, and answers paths relative to it', async () => {
      // Relative to the directory ASKED FOR — the contract the in-process helper and the
      // publisher answer too. A census follows its listing with a `readHead` of what it listed,
      // and nothing downstream knows which of the three executors produced the path it holds.
      const root = await sandbox({ 'a/one.ts': 'x', 'a/deep/two.ts': 'y', 'b/three.ts': 'z' })

      const { entries } = await createLocalFileHelper(root).statTree('a')

      expect(entries.map(entry => entry.path).sort()).toEqual(['deep/two.ts', 'one.ts'])
    })

    test('a head is read without holding the file', async () => {
      const root = await sandbox({ 'data.csv': 'id,name\n1,one\n2,two\n' })
      const helper = createLocalFileHelper(root)

      expect(await helper.readHead('data.csv', 8)).toBe('id,name\n')
      // Asking for more than there is answers what there is, rather than failing.
      expect(await helper.readHead('data.csv', 4096)).toBe('id,name\n1,one\n2,two\n')
      expect(await helper.readHead('data.csv', 0)).toBe('')
      expect(helper.readHead('../../etc/passwd', 10)).rejects.toThrow(SandboxPathError)
    })

    test('a head of something that is not a readable file is empty, never a throw', async () => {
      // A census hands this whatever the walk produced, and one entry that turns out to be a
      // directory (open succeeds on Linux; the READ then throws EISDIR) or to have been deleted
      // since the listing must not fail the pass classifying the rest of the tree.
      const root = await sandbox({ 'src/app.ts': 'x' })
      const helper = createLocalFileHelper(root)

      expect(await helper.readHead('src', 64)).toBe('')
      expect(await helper.readHead('src/gone.ts', 64)).toBe('')
    })
  })

  describe('relocate', () => {
    test('everything moves below, and what was never ours to move stays', async () => {
      const root = await sandbox({
        'app/page.tsx': 'export default () => null',
        'package.json': '{}',
        '.viable/connect.json': '{"projectId":"p1"}',
        '.env': 'DATABASE_URL=postgres://localhost/app',
        'sources/web/.env': 'BRANDING_PRODUCT=Thing',
        'sources/web/src/app.tsx': 'x',
        'sources/api/src/index.ts': 'y',
        '.git/HEAD': 'ref: refs/heads/main',
        'docs/brief.md': 'the brief',
      })

      const result = await createLocalFileHelper(root)
        .relocate(CONVERTED_ORIGIN_DIR, ['docs/brief.md'])

      // The origin's own tree, below.
      expect(await fse.pathExists(path.join(root, CONVERTED_ORIGIN_DIR, 'app/page.tsx'))).toBe(true)
      expect(await fse.pathExists(path.join(root, CONVERTED_ORIGIN_DIR, 'package.json'))).toBe(true)
      expect(await fse.pathExists(path.join(root, CONVERTED_ORIGIN_DIR, 'sources/web/src/app.tsx'))).toBe(true)
      expect(await fse.pathExists(path.join(root, 'app'))).toBe(false)
      // The marker, the two env files and the history — moving `.git` would take the project's
      // whole history under the origin with it.
      expect(await fse.pathExists(path.join(root, '.viable/connect.json'))).toBe(true)
      expect(await fse.pathExists(path.join(root, '.env'))).toBe(true)
      expect(await fse.pathExists(path.join(root, '.git/HEAD'))).toBe(true)
      // A nested keep of the caller's, and one of the helper's own.
      expect(await fse.pathExists(path.join(root, 'sources/web/.env'))).toBe(true)
      expect(await fse.pathExists(path.join(root, 'docs/brief.md'))).toBe(true)
      expect(result.moved).toBeGreaterThan(0)
      // The whole keep set, the way the publisher and the library helper answer it: what the
      // relocation was told to leave alone, not what happens to be on disk afterwards.
      expect(result.kept).toContain('docs/brief.md')
      expect(result.kept).toContain(CONVERTED_ORIGIN_DIR)
      expect(result.kept).toContain('.git')
    })

    test('a directory walked only for a keep that was not there does not survive empty', async () => {
      const root = await sandbox({ 'sources/api/src/index.ts': 'x' })

      await createLocalFileHelper(root).relocate(CONVERTED_ORIGIN_DIR)

      // `sources/web/.env` is always kept and this tree has none, so `sources/` was walked for
      // nothing — it must not be left behind as a skeleton the template install lands in.
      expect(await fse.pathExists(path.join(root, 'sources'))).toBe(false)
      expect(await fse.pathExists(path.join(root, CONVERTED_ORIGIN_DIR, 'sources/api/src/index.ts')))
        .toBe(true)
    })

    test('a destination that already holds something is refused', async () => {
      // Interleaving two trees leaves nothing able to tell which files came from where.
      const root = await sandbox({
        'app/page.tsx': 'x',
        [`${CONVERTED_ORIGIN_DIR}/already.ts`]: 'from an earlier run',
      })

      expect(createLocalFileHelper(root).relocate(CONVERTED_ORIGIN_DIR))
        .rejects.toThrow(FileCommandRefused)
      expect(await fse.pathExists(path.join(root, 'app/page.tsx'))).toBe(true)
    })

    test('the project cannot be moved into itself', async () => {
      const root = await sandbox({ 'a.ts': 'x' })

      expect(createLocalFileHelper(root).relocate('.')).rejects.toThrow(FileCommandRefused)
      expect(createLocalFileHelper(root).relocate('')).rejects.toThrow(FileCommandRefused)
    })
  })

  describe('removeTree', () => {
    test('a tree goes, and nothing outside the project can be named', async () => {
      const root = await sandbox({
        [`${CONVERTED_ORIGIN_DIR}/app/page.tsx`]: 'x',
        'sources/api/src/index.ts': 'y',
      })
      const helper = createLocalFileHelper(root)

      await helper.removeTree(CONVERTED_ORIGIN_DIR)

      expect(await fse.pathExists(path.join(root, CONVERTED_ORIGIN_DIR))).toBe(false)
      expect(await fse.pathExists(path.join(root, 'sources/api/src/index.ts'))).toBe(true)
      expect(helper.removeTree('../../tmp')).rejects.toThrow(SandboxPathError)
    })

    test('the project root itself is refused', async () => {
      // Emptying the project is `emptyProject`, which has a keep list this does not — a purge that
      // resolved to `.` would take the developer's `.git` and `.env` with it.
      const root = await sandbox({ 'a.ts': 'x' })
      const helper = createLocalFileHelper(root)

      expect(helper.removeTree('.')).rejects.toThrow(FileCommandRefused)
      expect(helper.removeTree('')).rejects.toThrow(FileCommandRefused)
      expect(await fse.pathExists(path.join(root, 'a.ts'))).toBe(true)
    })
  })

  describe('reads and writes', () => {
    test('sources round-trip through the shapes the platform parses', async () => {
      const root = await sandbox()
      const helper = createLocalFileHelper(root)

      await helper.writeSource({ path: 'sources/api/src/a.ts', code: 'export const a = 1' })
      await helper.writeFile('sources/api/src/b.ts', 'export const b = 2')

      expect(await helper.readSource('sources/api/src/a.ts'))
        .toEqual({ path: 'sources/api/src/a.ts', code: 'export const a = 1' })
      expect(await helper.readSources(['sources/api/src/a.ts', 'sources/api/src/b.ts'])).toEqual([
        { path: 'sources/api/src/a.ts', code: 'export const a = 1' },
        { path: 'sources/api/src/b.ts', code: 'export const b = 2' },
      ])

      await helper.deleteFile('sources/api/src/b.ts')
      expect(await fse.pathExists(path.join(root, 'sources/api/src/b.ts'))).toBe(false)
      // Deleting what is not there is the ordinary case for a cleanup pass.
      await helper.deleteFile('sources/api/src/b.ts')
    })
  })
})
