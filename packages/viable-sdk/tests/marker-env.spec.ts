import { afterEach, describe, expect, test } from 'bun:test'
import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'

import { CONNECT_ENV_BEGIN, CONNECT_ENV_END, CONNECT_MARKER_FILE } from '@owlmeans/viable-common'
import type { ConnectMarker } from '@owlmeans/viable-common'

import { discoverProject, readMarker, writeMarker } from '../src/project/marker.js'
import { envStatus, readEnv, replaceManagedBlock, writeEnv } from '../src/project/env.js'

/**
 * What a local project remembers about itself, and how its configuration is written.
 *
 * The marker is the only thing that says which platform project a directory is; the managed block
 * is the only part of a `.env` the platform may rewrite. Both exist because the directory is
 * shared with a person: they started the agent three levels down, and they wrote the database URL
 * the platform cannot provision.
 */
describe('viable-sdk — project marker and env', () => {
  const roots: string[] = []

  const sandbox = async (files: Record<string, string> = {}): Promise<string> => {
    const root = await fse.mkdtemp(path.join(os.tmpdir(), 'viable-sdk-project-'))
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

  const marker = (): ConnectMarker => ({
    version: 1,
    apiUrl: 'https://vib-api.example.org',
    projectId: '65f0000000000000000000aa',
    slug: 'orchard',
    entitySlug: 'acme',
    createdAt: '2026-01-02T03:04:05.000Z',
  })

  describe('marker', () => {
    test('round-trips through the file the platform names', async () => {
      const root = await sandbox()

      await writeMarker(root, marker())

      expect(await fse.pathExists(path.join(root, CONNECT_MARKER_FILE))).toBe(true)
      expect(await readMarker(root)).toEqual(marker())
    })

    test('a directory with no marker, and one with an unreadable one, both answer null', async () => {
      // A half-written marker is the same as none: the connector re-attaches by slug and writes a
      // fresh one, which is strictly better than refusing to open the project.
      const empty = await sandbox()
      const broken = await sandbox({ [CONNECT_MARKER_FILE]: '{ not json' })

      expect(await readMarker(empty)).toBeNull()
      expect(await readMarker(broken)).toBeNull()
    })

    test('discovery walks up from wherever the agent was started', async () => {
      // An agent is started where its user happened to be — usually several levels inside the
      // tree — and every tool that acts on "this project" has to mean the same one.
      const root = await sandbox()
      await writeMarker(root, marker())
      const deep = path.join(root, 'sources', 'web', 'src', 'components')
      await fse.ensureDir(deep)

      const found = await discoverProject(deep)

      expect(found?.dir).toBe(root)
      expect(found?.marker.slug).toBe('orchard')
    })

    test('a machine with no marker above answers null rather than guessing', async () => {
      const root = await sandbox()

      expect(await discoverProject(root)).toBeNull()
    })
  })

  describe('the managed block', () => {
    test('a file with no block gets one appended, and the user\'s lines stay above it', async () => {
      expect(replaceManagedBlock('MY_KEY=mine\n', 'OIDC_CLIENT=abc')).toBe(
        `MY_KEY=mine\n${CONNECT_ENV_BEGIN}\nOIDC_CLIENT=abc\n${CONNECT_ENV_END}\n`
      )
    })

    test('a second write replaces the block instead of adding another', async () => {
      const first = replaceManagedBlock('', 'OIDC_CLIENT=one')
      const second = replaceManagedBlock(first, 'OIDC_CLIENT=two')

      expect(second.split(CONNECT_ENV_BEGIN).length - 1).toBe(1)
      expect(second).toContain('OIDC_CLIENT=two')
      expect(second).not.toContain('OIDC_CLIENT=one')
    })

    test('lines on both sides of the block survive a rewrite', async () => {
      const existing = `BEFORE=1\n${CONNECT_ENV_BEGIN}\nOIDC_CLIENT=old\n${CONNECT_ENV_END}\nAFTER=2\n`

      const next = replaceManagedBlock(existing, 'OIDC_CLIENT=new')

      expect(next).toBe(
        `BEFORE=1\n${CONNECT_ENV_BEGIN}\nOIDC_CLIENT=new\n${CONNECT_ENV_END}\nAFTER=2\n`
      )
    })

    test('a block whose END was lost is rewritten rather than duplicated', async () => {
      // The alternative is a block that grows a second copy of itself on every push.
      const truncated = `KEEP=1\n${CONNECT_ENV_BEGIN}\nOIDC_CLIENT=old\n`

      const next = replaceManagedBlock(truncated, 'OIDC_CLIENT=new')

      expect(next).toBe(`KEEP=1\n${CONNECT_ENV_BEGIN}\nOIDC_CLIENT=new\n${CONNECT_ENV_END}\n`)
    })
  })

  describe('writeEnv', () => {
    test('a key the user assigned is left to them, and said so in the file', async () => {
      // The defect: a `.env` takes the LAST assignment of a key and the block is appended, so a
      // platform line silently outranked whatever the user wrote above it. `DATABASE_URL` is the
      // one value the platform cannot supply and the setup guide tells people to write, and the
      // application connected to the placeholder no matter what its owner put in the file.
      const root = await sandbox({
        '.env': 'DATABASE_URL=postgres://me@localhost:5432/mine\n',
      })

      await writeEnv(root, {
        files: [{
          path: '.env',
          content: 'OIDC_CLIENT=c\nDATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres',
        }],
        probe: [],
      })

      const written = await fse.readFile(path.join(root, '.env'), 'utf-8')
      expect(written).toContain('DATABASE_URL=postgres://me@localhost:5432/mine')
      expect(written).not.toContain('postgres:postgres@localhost')
      expect(written).toContain('# DATABASE_URL is set in your own lines')
      // Everything the user did NOT claim is still the platform's to set.
      expect(written).toContain('OIDC_CLIENT=c')

      const env = await readEnv(root)
      expect(env.values.DATABASE_URL).toBe('postgres://me@localhost:5432/mine')
    })

    test('a second push keeps yielding, and does not stack comments', async () => {
      const root = await sandbox({ '.env': 'DATABASE_URL=postgres://me@localhost:5432/mine\n' })
      const push = async (): Promise<void> => {
        await writeEnv(root, {
          files: [{ path: '.env', content: 'OIDC_CLIENT=c\nDATABASE_URL=placeholder' }],
          probe: [],
        })
      }

      await push()
      await push()

      const written = await fse.readFile(path.join(root, '.env'), 'utf-8')
      expect(written.split('# DATABASE_URL is set in your own lines')).toHaveLength(2)
      expect((await readEnv(root)).values.DATABASE_URL).toBe('postgres://me@localhost:5432/mine')
    })

    test('a value the user later removes goes back to the platform', async () => {
      const root = await sandbox({ '.env': 'DATABASE_URL=postgres://me@localhost:5432/mine\n' })
      await writeEnv(root, {
        files: [{ path: '.env', content: 'DATABASE_URL=placeholder' }], probe: [],
      })

      // The user deletes their line; the next push is free to set it again.
      const current = await fse.readFile(path.join(root, '.env'), 'utf-8')
      await fse.writeFile(
        path.join(root, '.env'),
        current.replace('DATABASE_URL=postgres://me@localhost:5432/mine\n', '')
      )
      await writeEnv(root, {
        files: [{ path: '.env', content: 'DATABASE_URL=placeholder' }], probe: [],
      })

      expect((await readEnv(root)).values.DATABASE_URL).toBe('placeholder')
    })

    test('writes every named file, creating the ones that are not there', async () => {
      const root = await sandbox({ '.env': '# mine\nDATABASE_URL=postgres://localhost:1/app\n' })

      const result = await writeEnv(root, {
        files: [
          { path: '.env', content: 'OIDC_ISSUER_URL=https://iam/\nOIDC_CLIENT=c\nOIDC_SECRET=s' },
          { path: 'sources/web/.env', content: 'BRANDING_PRODUCT=Orchard' },
        ],
        probe: [],
      })

      expect(result.written).toEqual(['.env', 'sources/web/.env'])
      expect(result.missing).toEqual([])

      const root_env = await fse.readFile(path.join(root, '.env'), 'utf-8')
      // The user's own line is above the block and untouched.
      expect(root_env.startsWith('# mine\nDATABASE_URL=postgres://localhost:1/app\n')).toBe(true)
      expect(root_env).toContain('OIDC_CLIENT=c')
      expect(await fse.readFile(path.join(root, 'sources/web/.env'), 'utf-8'))
        .toContain('BRANDING_PRODUCT=Orchard')
    })

    test('an empty value counts as missing, exactly like an absent key', async () => {
      // What a push that ran before the secret existed leaves behind. A target holding
      // `OIDC_CLIENT=''` is one whose users can never sign in, with nothing anywhere saying so.
      const root = await sandbox()

      const result = await writeEnv(root, {
        files: [{ path: '.env', content: 'OIDC_ISSUER_URL=https://iam/\nOIDC_CLIENT=\n' }],
        probe: [],
      })

      expect(result.missing).toEqual(['OIDC_CLIENT', 'OIDC_SECRET'])
    })

    test('a path that climbs out of the project is refused', async () => {
      const root = await sandbox()

      expect(writeEnv(root, {
        files: [{ path: '../../.bashrc', content: 'OIDC_CLIENT=c' }], probe: [],
      })).rejects.toThrow()
    })

    test('an unprobed service is reported false rather than becoming a round trip', async () => {
      const root = await sandbox({ '.env': 'DATABASE_URL=postgres://127.0.0.1:1/app\n' })

      const result = await writeEnv(root, { files: [], probe: [] })

      expect(result.services).toEqual({ db: false, valkey: false })
    })

    test('a database nothing is listening on is reported unreachable', async () => {
      // Port 1 is reserved and never bound; the probe is a connect, not a guess.
      const root = await sandbox({ '.env': 'DATABASE_URL=postgres://127.0.0.1:1/app\n' })

      const result = await envStatus(root, ['db'])

      expect(result.services.db).toBe(false)
    })
  })

  describe('readEnv', () => {
    test('the server\'s file and the browser\'s file are read apart', async () => {
      // The split IS the leak boundary: whatever is in the web package's file is compiled into a
      // bundle anybody can read, so nothing may reach it by merging in the server's.
      const root = await sandbox({
        // `sources/api` is the layout marker: which file is "the browser's" is a question about
        // the tree, and a v1 project's browser package is `packages/frontend`.
        'sources/api/package.json': '{}',
        '.env': 'OIDC_SECRET=shh\nDATABASE_URL=postgres://localhost/app\n',
        'sources/web/.env': 'BRANDING_PRODUCT=Orchard\n',
      })

      const env = await readEnv(root)

      expect(env.files['.env'].OIDC_SECRET).toBe('shh')
      expect(env.files['sources/web/.env']).toEqual({ BRANDING_PRODUCT: 'Orchard' })
      expect(env.files['sources/web/.env'].OIDC_SECRET).toBeUndefined()
    })

    test('quotes, comments and an export prefix are all understood', async () => {
      const root = await sandbox({
        '.env': '# a comment\nexport OIDC_CLIENT="quoted"\nEMPTY=\nOIDC_SECRET=\'single\'\n',
      })

      const env = await readEnv(root)

      expect(env.values.OIDC_CLIENT).toBe('quoted')
      expect(env.values.OIDC_SECRET).toBe('single')
      expect(env.values.EMPTY).toBe('')
    })
  })
})
