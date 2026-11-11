import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import {
  CONNECT_TOKEN_PREFIX, connect, ConnectHarness, ConnectLlm, ConnectMaterialTextSource, ConnectTarget, MATERIALS_LIMITS,
  MATERIALS_UPLOAD_POLICY, type ConnectProjectStatus,
} from '@owlmeans/viable-common'

import { makeRemoteConnectorApi } from '../src/api/remote.js'
import { TOOL_DEADLINE_MS } from '../src/consts.js'
import { makeSdkContext } from '../src/context/index.js'
import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { PLATFORM_CATALOGUE, ToolHostKind } from '../src/tools/consts.js'
import { toolHostHelper } from '../src/tools/host.js'
import { serverInstructions } from '../src/tools/mcp.js'
import { renderPlatform } from '../src/tools/platform.js'
import type { ConnectorApi } from '../src/types.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'
import { captureTransport, type CapturedCall } from './context.js'

const UPLOAD = 'create_project_with_files'
const READS = ['list_materials', 'read_material']

const host = (patch: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Stdio, target: ConnectTarget.Cloud, llm: ConnectLlm.Cloud, harness: ConnectHarness.ClaudeCode,
  hasExecutor: false, ...patch,
})

const offered = (h: ToolHost): string[] => catalogueHelper.visibleTools(h).map(tool => tool.name)

const STATUS = {
  project: { id: 'p1', name: 'Bakery', alias: 'bakery', status: 'draft', description: 'A bakery shop.' },
  agent: { locked: false },
} as unknown as ConnectProjectStatus

/** What the platform answers for an upload session of the project. */
const sessionOf = (status = 'open') => ({
  id: 'p1', status, policy: { ...MATERIALS_UPLOAD_POLICY }, files: [], totals: { files: 0, bytes: 0 },
  createdAt: '2026-11-10T10:00:00.000Z', updatedAt: '2026-11-10T10:00:00.000Z',
})

const bytesOf = async (body: unknown): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of body as Readable) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array))

  return Buffer.concat(chunks).toString('utf8')
}

describe('viable-sdk — a new project\'s files, offered where they can work', () => {
  test('upload only on a host that reads a disk, never fully local; the two reads on every host', () => {
    const cases: Array<[string, ToolHost, boolean]> = [
      ['stdio local + cloud', host({ target: ConnectTarget.Local, hasExecutor: true }), true],
      ['stdio cloud + cloud', host(), true],
      ['stdio cloud + local', host({ llm: ConnectLlm.Local }), true],
      ['stdio local + local', host({ target: ConnectTarget.Local, llm: ConnectLlm.Local, hasExecutor: true }), false],
      ['hosted cloud + cloud', host({ kind: ToolHostKind.Http }), false],
      ['hosted cloud + local', host({ kind: ToolHostKind.Http, llm: ConnectLlm.Local }), false],
    ]
    for (const [name, h, upload] of cases) {
      const names = offered(h)
      expect([name, names.includes(UPLOAD)]).toEqual([name, upload])
      expect([name, READS.filter(tool => !names.includes(tool))]).toEqual([name, []])
      expect([name, toolHostHelper.uploadsMaterials(h)]).toEqual([name, upload])
      // The instructions and describe_platform never name a tool the host hides.
      expect([name, serverInstructions({ host: h }).includes(UPLOAD)]).toEqual([name, upload])
      expect([name, renderPlatform(PLATFORM_CATALOGUE, h).includes(UPLOAD)]).toEqual([name, upload])
      expect([name, serverInstructions({ host: h }).includes('list_materials, read_material')]).toEqual([name, true])
    }
  })

  test('the upload adds a project and spends credits; the reads are reads', () => {
    const tool = (name: string) => catalogue.find(entry => entry.name === name)!

    expect(tool(UPLOAD).annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false })
    expect(tool(UPLOAD).description).toContain('spends credits')
    expect(tool(UPLOAD).description).toContain('calling it again spends again')
    for (const name of READS) expect([name, tool(name).annotations.readOnlyHint]).toEqual([name, true])
    expect(PLATFORM_CATALOGUE.capabilities.find(group => group.id === 'materials')!.tools).toEqual([UPLOAD, ...READS])
  })
})

describe('viable-sdk — create_project_with_files over the remote connector', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'viable-sdk-materials-'))
    writeFileSync(join(dir, 'brief.md'), '# A bakery shop')
    mkdirSync(join(dir, 'brand'))
    writeFileSync(join(dir, 'brand', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    // Sparse: past the per-file limit without writing twelve megabytes.
    writeFileSync(join(dir, 'film.mp4'), '')
    truncateSync(join(dir, 'film.mp4'), MATERIALS_LIMITS.fileBytes + 1)
  })
  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  /** The remote API over a captured platform that answers the materials routes as the public API does. */
  const platform = async (opts: { llm?: ConnectLlm, sealRefused?: boolean } = {}) => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`, ...(opts.llm != null ? { llm: opts.llm } : {}),
    })
    const received: Record<string, string> = {}
    const calls = captureTransport(context, async (call: CapturedCall) => {
      switch (call.alias) {
        case connect.project.createWithMaterials: return STATUS
        case connect.project.materials.state: return sessionOf()
        case connect.project.materials.file: {
          const path = call.query.path as string
          received[path] = await bytesOf(call.body)
          return { files: [{ id: `f-${path}`, path, name: path.split('/').at(-1), size: received[path]!.length, status: 'accepted', kind: 'text' }] }
        }
        case connect.project.materials.seal:
          if (opts.sealRefused === true) throw new Error('upload:session:state:closed')
          return sessionOf('sealed')
        case connect.project.materials.draft: return { state: 'sealed', files: 2, bytes: 10, rejected: 0 }
        default: throw new Error(`unexpected platform call ${call.alias}`)
      }
    })

    return { api: makeRemoteConnectorApi(context), calls, received }
  }

  const depsOf = (api: ConnectorApi, h: ToolHost, order: string[] = []): ToolDeps => {
    let attached: string | null = null

    return {
      api, host: h, dir,
      session: async () => { order.push(`session:${attached ?? 'none'}`); return { session: { id: 's-unattached' } } as never },
      currentSession: () => null,
      attached: () => attached,
      attach: projectId => { order.push(`attach:${projectId}`); attached = projectId },
      detach: () => { attached = null },
      log: () => undefined,
    }
  }

  const run = async (deps: ToolDeps, args: Record<string, unknown>) =>
    await catalogue.find(tool => tool.name === UPLOAD)!.run(args, deps)

  test('refused files are reported before anything is sent; the rest announced, streamed, sealed', async () => {
    const { api, calls, received } = await platform()
    const result = await run(depsOf(api, host()), {
      prompt: 'A bakery shop', paths: ['brief.md', 'brand', 'film.mp4', 'missing.txt'],
    })

    expect(result.isError).not.toBe(true)
    expect(calls.map(call => call.alias)).toEqual([
      connect.project.createWithMaterials, connect.project.materials.state,
      connect.project.materials.file, connect.project.materials.file, connect.project.materials.seal,
    ])
    // The announcement is what the precheck admitted; the create body is closed — nothing else crosses.
    expect(calls[0]!.body).toEqual({
      prompt: 'A bakery shop', target: ConnectTarget.Cloud,
      materials: { files: 2, bytes: '# A bakery shop'.length + '<svg xmlns="http://www.w3.org/2000/svg"/>'.length },
    })
    expect(calls[0]!.timeout).toBe(TOOL_DEADLINE_MS)
    expect(received).toEqual({ 'brief.md': '# A bakery shop', 'brand/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' })
    expect(calls.filter(call => call.alias === connect.project.materials.file).map(call => [call.path, call.query.size != null]))
      .toEqual([['/connect/project/materials/:id/file', true], ['/connect/project/materials/:id/file', true]])
    expect(result.text).toContain('2 accepted, 1 refused before sending, 1 not readable here')
    expect(result.text).toContain('film.mp4 — over the limits')
    expect(result.text).toContain('the upload is sealed')
    expect(result.text).toContain('bakery')
    expect(result.structured).toMatchObject({
      project: STATUS, pending: false, sealed: true,
      files: expect.arrayContaining([
        { path: 'brief.md', status: 'accepted', size: 15 },
        { path: 'film.mp4', status: 'refused', reason: 'limits', size: MATERIALS_LIMITS.fileBytes + 1 },
        { path: 'missing.txt', status: 'unreadable', reason: 'unreadable' },
      ]),
    })
  })

  test('nothing admissible creates nothing', async () => {
    const { api, calls } = await platform()
    const result = await run(depsOf(api, host()), { prompt: 'A bakery shop', paths: ['film.mp4', 'missing.txt'] })

    expect(result.isError).toBe(true)
    expect(result.text).toContain('Nothing was created')
    expect(calls).toEqual([])
  })

  test('a refused seal drafts with what arrived', async () => {
    const { api, calls } = await platform({ sealRefused: true })
    const result = await run(depsOf(api, host()), { prompt: 'A bakery shop', paths: ['brief.md'] })

    expect(calls.map(call => call.alias).slice(-2)).toEqual([connect.project.materials.seal, connect.project.materials.draft])
    expect(calls.at(-1)!.body).toEqual({ force: true })
    expect(result.structured).toMatchObject({ sealed: true })
  })

  test('the delegated mode names an unattached session, then attaches the project before the first file', async () => {
    const { api, calls } = await platform({ llm: ConnectLlm.Local })
    const order: string[] = []
    await run(depsOf(api, host({ llm: ConnectLlm.Local }), order), { prompt: 'A bakery shop', paths: ['brief.md'] })

    expect((calls[0]!.body as Record<string, unknown>).sessionId).toBe('s-unattached')
    // The seal hands the drafting to the project's delegating session: attached before anything is sent.
    expect(order).toEqual(['session:none', 'attach:p1', 'attach:p1', 'session:p1'])
  })
})

describe('viable-sdk — reading a project\'s files', () => {
  const remote = async (answer: (call: CapturedCall) => unknown) => {
    const context = await makeSdkContext({ apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token` })
    const calls = captureTransport(context, answer)

    return { api: makeRemoteConnectorApi(context), calls }
  }
  const deps = (api: ConnectorApi): ToolDeps => ({
    api, host: host({ kind: ToolHostKind.Http }), session: async () => { throw new Error('none') }, currentSession: () => null,
    attached: () => 'p1', attach: () => undefined, log: () => undefined,
  })
  const tool = (name: string) => catalogue.find(entry => entry.name === name)!

  test('list_materials: every file with its purpose and status, the state, and the next read', async () => {
    const { api, calls } = await remote(() => ({
      state: 'drafted', files: 1, bytes: 15, rejected: 1,
      entries: [
        { path: 'brief.md', name: 'brief.md', size: 15, status: 'catalogued', purpose: 'specification', description: 'The brief.' },
        { path: 'tool.exe', name: 'tool.exe', size: 4, status: 'rejected', reason: 'executable' },
      ],
    }))
    const result = await tool('list_materials').run({}, deps(api))

    expect([calls[0]!.alias, calls[0]!.path, calls[0]!.timeout])
      .toEqual([connect.project.materials.catalogue, '/connect/project/materials/:id/catalogue', TOOL_DEADLINE_MS])
    expect(result.text).toContain('files of p1: 1 usable, 1 rejected · drafted')
    expect(result.text).toContain('brief.md · specification · catalogued — The brief.')
    expect(result.text).toContain('tool.exe · not classified yet · rejected (a program or a compiled binary)')
    expect(result.text).toContain('confirm_project builds it')
    expect(result.text).toContain('next: read_material {"projectId":"p1","path":"brief.md"}')

    const none = await remote(() => ({ state: null, files: 0, bytes: 0, rejected: 0, entries: [] }))
    expect((await tool('list_materials').run({}, deps(none.api))).text).toBe('Project p1 was created without files.')
  })

  test('read_material: the transcript or the text, said where it came from and where it was cut; none for media', async () => {
    const { api, calls } = await remote(call => (call.query.path === 'logo.png'
      ? { path: 'logo.png', source: null, text: '', length: 0 }
      : { path: 'spec.pdf', source: ConnectMaterialTextSource.Transcript, text: '# Spec', length: 200_000, truncated: true }))
    const transcript = await tool('read_material').run({ path: 'spec.pdf' }, deps(api))
    const media = await tool('read_material').run({ path: 'logo.png' }, deps(api))

    expect([calls[0]!.alias, calls[0]!.path, calls[0]!.query]).toEqual([
      connect.project.materials.read, '/connect/project/materials/:id/content', { path: 'spec.pdf' },
    ])
    expect(transcript.text).toBe('# Spec\n\n[spec.pdf: the platform\'s markdown transcript of the document; the first 6 of 200000 characters]')
    expect(transcript.structured).toEqual({ projectId: 'p1', path: 'spec.pdf', source: 'transcript', length: 200_000, truncated: true })
    expect(media.text).toContain('logo.png carries no text')
    expect((await tool('read_material').run({}, deps(api))).isError).toBe(true)
  })

  test('the remote members address their routes and send only what was named', async () => {
    const { api, calls } = await remote(() => ({ state: 'sealed', files: 0, bytes: 0, rejected: 0, id: 'p1' }))
    await api.materials.draft('p1')
    await api.materials.draft('p1', true)
    await api.materials.remove('p1', 'f1')
    await api.materials.seal('p1')

    expect(calls.map(call => [call.alias, call.path, call.body ?? null])).toEqual([
      [connect.project.materials.draft, '/connect/project/materials/:id/draft', {}],
      [connect.project.materials.draft, '/connect/project/materials/:id/draft', { force: true }],
      [connect.project.materials.remove, '/connect/project/materials/:id/file/:file', null],
      [connect.project.materials.seal, '/connect/project/materials/:id/seal', {}],
    ])
  })
})
