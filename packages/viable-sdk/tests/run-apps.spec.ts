import { afterEach, describe, expect, test } from 'bun:test'
import fse from 'fs-extra'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { TARGET_WEB_PORT } from '@owlmeans/viable-common'

import { makeTargetEnvHelper } from '../src/executor/env.js'
import { makeLayoutHelper } from '../src/executor/layout.js'
import { createLocalServer } from '../src/run/serve.js'
import type { LocalServer } from '../src/run/types.js'
import { SPLIT_TOPOLOGY_FILE, makeTargetTree } from './apps-fixture.js'

/**
 * A split TARGET project run on a developer's machine: its apps read off the topology record, each
 * app's packages and environment, and ONE local server holding the web port that routes by mount —
 * `/<mount>/api` to that app's api with the path kept, `/<mount>` from that app's build with the SPA
 * fallback, `/` main's. A tree without the record is the one app it always was.
 */
describe('viable-sdk — a split project run locally', () => {
  const roots: string[] = []
  const servers: Array<{ close: () => Promise<void> }> = []

  const tree = async (opts: Parameters<typeof makeTargetTree>[0] = {}): Promise<string> => {
    const root = await makeTargetTree(opts)
    roots.push(root)

    return root
  }

  afterEach(async () => {
    while (servers.length > 0) await servers.pop()!.close()
    while (roots.length > 0) await fse.remove(roots.pop()!)
  })

  /** A loopback stand-in for one app's api: it answers the path it was asked, tagged with its name. */
  const fakeApi = async (name: string): Promise<number> => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ app: name, path: req.url }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
    servers.push({ close: async () => await new Promise<void>(resolve => server.close(() => resolve())) })

    return (server.address() as AddressInfo).port
  }

  const freePort = async (): Promise<number> => {
    const probe = http.createServer()
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', () => resolve()))
    const { port } = probe.address() as AddressInfo
    await new Promise<void>(resolve => probe.close(() => resolve()))

    return port
  }

  const served = async (server: LocalServer): Promise<(url: string) => Promise<{ status: number, body: string }>> => {
    const port = await freePort()
    await server.listen(port)
    servers.push(server)

    return async url => {
      const response = await fetch(`http://127.0.0.1:${port}${url}`)

      return { status: response.status, body: await response.text() }
    }
  }

  const build = async (root: string, pkg: string, files: Record<string, string>): Promise<string> => {
    const dist = path.join(root, 'sources', pkg, 'dist')
    for (const [file, content] of Object.entries(files)) await fse.outputFile(path.join(dist, file), content)

    return dist
  }

  test('the apps come from the topology record, main first; no record, a v1 tree or a broken map is main alone', async () => {
    const split = await tree({ split: true })
    expect(makeLayoutHelper(split).apps().map(app => [app.name, app.mount, app.index, app.web, app.api])).toEqual([
      ['main', '', 0, 'web', 'api'],
      ['admin', 'admin', 1, 'admin-web', 'admin-api'],
      ['backoffice', 'backoffice', 2, 'backoffice-web', 'backoffice-api'],
    ])

    const plain = await tree()
    expect(makeLayoutHelper(plain).apps().map(app => [app.name, app.mount])).toEqual([['main', '']])

    // A map that breaks a rule (two apps on one mount) is not half-read: it is main alone.
    const broken = await tree({ topology: SPLIT_TOPOLOGY_FILE.replace('mount: "backoffice"', 'mount: "admin"') })
    expect(makeLayoutHelper(broken).apps().map(app => app.name)).toEqual(['main'])

    const v1 = await fse.mkdtemp(path.join(path.dirname(plain), 'viable-sdk-v1-'))
    roots.push(v1)
    await fse.ensureDir(path.join(v1, 'packages/frontend'))
    await fse.outputFile(path.join(v1, '.agents/memory/topology.md'), SPLIT_TOPOLOGY_FILE)
    expect(makeLayoutHelper(v1).apps().map(app => app.name)).toEqual(['main'])
  })

  test('each app has its own packages; main\'s are exactly the layout\'s', async () => {
    const root = await tree({ split: true })
    const layout = makeLayoutHelper(root)

    expect([layout.webPath(), layout.apiPath()]).toEqual([path.join(root, 'sources/web'), path.join(root, 'sources/api')])
    expect([layout.webPath('main'), layout.apiPath('main')]).toEqual([layout.webPath(), layout.apiPath()])
    expect([layout.webPath('admin'), layout.apiPath('admin')])
      .toEqual([path.join(root, 'sources/admin-web'), path.join(root, 'sources/admin-api')])
    expect(layout.webPath('backoffice')).toBe(path.join(root, 'sources/backoffice-web'))
  })

  test('another app\'s api binds its own port under its mount; main\'s environment is unchanged', async () => {
    const root = await tree({ split: true })
    await fse.outputFile(path.join(root, '.env'), 'BACKEND_PORT=3000\nBACKEND_BASE_URL=api\nBASE_URL=\nDATABASE_URL=postgres://x\n')
    const env = makeTargetEnvHelper(root)
    const admin = makeLayoutHelper(root).apps()[1]!

    const main = await env.backendEnv()
    expect([main.BACKEND_PORT, main.BACKEND_BASE_URL, main.BASE_URL]).toEqual(['3000', 'api', ''])
    expect(await env.backendEnv({ name: 'main', mount: '', index: 0 })).toEqual(main)

    const own = await env.backendEnv(admin)
    expect([own.BACKEND_PORT, own.BACKEND_BASE_URL, own.BASE_URL, own.DATABASE_URL])
      .toEqual(['3010', 'admin/api', 'admin', 'postgres://x'])
  })

  test('another app\'s web builds under its mount, from its own package\'s .env, on the one web port', async () => {
    const root = await tree({ split: true, dirs: ['sources/admin-web'] })
    await fse.outputFile(path.join(root, 'sources/web/.env'), 'APP_NAME=Main\n')
    await fse.outputFile(path.join(root, 'sources/admin-web/.env'), 'APP_NAME=Admin\n')
    const env = makeTargetEnvHelper(root)

    const main = await env.frontendEnv()
    expect([main.BASE_URL, main.BACKEND_BASE_URL, main.APP_NAME]).toEqual(['/', 'api', 'Main'])

    const admin = await env.frontendEnv(makeLayoutHelper(root).apps()[1]!)
    expect([admin.BASE_URL, admin.BACKEND_BASE_URL, admin.APP_NAME, admin.BACKEND_PORT])
      .toEqual(['/admin', 'admin/api', 'Admin', String(TARGET_WEB_PORT)])
    expect(admin.FRONTEND_ENV_KEYS.split(',')).toContain('APP_NAME')
  })

  test('one server routes by mount, longest first: each api keeps its path, each build has its SPA fallback', async () => {
    const root = await tree({ split: true })
    const mainDist = await build(root, 'web', { 'index.html': 'main-index', 'bundle.js': 'main-bundle' })
    const adminDist = await build(root, 'admin-web', { 'index.html': 'admin-index', 'bundle.js': 'admin-bundle' })
    const mainApi = await fakeApi('main')
    const adminApi = await fakeApi('admin')
    const get = await served(createLocalServer(() => mainDist, {
      apiPort: mainApi,
      apps: [
        { name: 'main', mount: '', apiPort: mainApi, webDir: () => mainDist },
        { name: 'admin', mount: 'admin', apiPort: adminApi, webDir: () => adminDist },
      ],
    }))

    expect(JSON.parse((await get('/admin/api/healtz?x=1')).body)).toEqual({ app: 'admin', path: '/admin/api/healtz?x=1' })
    expect(JSON.parse((await get('/api/healtz')).body)).toEqual({ app: 'main', path: '/api/healtz' })
    expect((await get('/admin/bundle.js')).body).toBe('admin-bundle')
    expect((await get('/admin')).body).toBe('admin-index')
    expect((await get('/admin/')).body).toBe('admin-index')
    expect((await get('/admin/users/42')).body).toBe('admin-index')
    expect((await get('/bundle.js')).body).toBe('main-bundle')
    expect((await get('/frontoffice')).body).toBe('main-index')
    // A path that merely starts with a mount's letters is main's.
    expect((await get('/administrator')).body).toBe('main-index')
    expect((await get('/admin/../../etc/passwd')).status).not.toBe(500)
  })

  test('one app is served exactly as before apps: /api proxied, everything else from main\'s build', async () => {
    const root = await tree()
    const mainDist = await build(root, 'web', { 'index.html': 'main-index' })
    const mainApi = await fakeApi('main')
    // A single app in the list routes like no list at all.
    for (const options of [{ apiPort: mainApi }, { apiPort: mainApi, apps: [{ name: 'main', mount: '', apiPort: mainApi, webDir: () => mainDist }] }]) {
      const get = await served(createLocalServer(() => mainDist, options))

      expect(JSON.parse((await get('/api/x')).body)).toEqual({ app: 'main', path: '/api/x' })
      expect((await get('/admin/api/x')).body).toBe('main-index')
      expect((await get('/anything')).body).toBe('main-index')
    }
  })
})
