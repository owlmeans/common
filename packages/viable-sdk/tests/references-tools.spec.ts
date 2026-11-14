import { describe, expect, test } from 'bun:test'
import { ApiStatusError } from '@owlmeans/api'
import {
  CONNECT_TOKEN_PREFIX, connect, ConnectHarness, ConnectLlm, ConnectMaterialTextSource, ConnectTarget, ProjectNotFound,
  type ConnectProjectStatus,
} from '@owlmeans/viable-common'

import { makeRemoteConnectorApi } from '../src/api/remote.js'
import { TOOL_DEADLINE_MS } from '../src/consts.js'
import { makeSdkContext } from '../src/context/index.js'
import { catalogue } from '../src/tools/catalogue.js'
import { ToolHostKind } from '../src/tools/consts.js'
import { makeReferencesTool } from '../src/tools/references.js'
import type { ConnectorApi } from '../src/types.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'
import { captureTransport, type CapturedCall } from './context.js'

/**
 * A project's references through the connector: create_project and confirm_project ask the platform's
 * references routes (the prompt's links, research requests and packages read; the confirmed
 * specification's refreshed), fall back to the released routes on a platform older than them, and
 * list_materials / read_material show the ledger and the generated documents.
 */
const STATUS = {
  project: { id: 'p1', name: 'Crmore', alias: 'crmore', status: 'draft', description: 'A CRM.' },
  agent: { locked: false },
} as unknown as ConnectProjectStatus

const PROMPT = 'A CRM. Pricing: https://s3-stage.owlmeans.link/bucket/public/pricing.md — search online for lead scoring.'

const host = (patch: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Stdio, target: ConnectTarget.Cloud, llm: ConnectLlm.Cloud, harness: ConnectHarness.ClaudeCode,
  hasExecutor: false, ...patch,
})

const tool = (name: string) => catalogue.find(entry => entry.name === name)!

/** The remote API over a captured platform: `missing` lists the aliases it answers as an unknown route. */
const platform = async (opts: { missing?: string[], answer?: (call: CapturedCall) => unknown } = {}) => {
  const context = await makeSdkContext({ apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token` })
  const calls = captureTransport(context, call => {
    // Fastify's own 404 for a route it does not have: a bare status, no incident id.
    if (opts.missing?.includes(call.alias) === true) throw new ApiStatusError(404)
    return opts.answer != null ? opts.answer(call) : STATUS
  })

  return { api: makeRemoteConnectorApi(context), calls }
}

const depsOf = (api: ConnectorApi, h: ToolHost = host()): ToolDeps => {
  let attached: string | null = null

  return {
    api, host: h,
    session: async () => ({ session: { id: 's1' } }) as never,
    currentSession: () => null,
    attached: () => attached,
    attach: (projectId: string) => { attached = projectId },
    detach: () => { attached = null },
    log: () => undefined,
  } as unknown as ToolDeps
}

describe('viable-sdk — create_project and confirm_project read the references', () => {
  test('the members address their own routes with the released bodies and the tool deadline', async () => {
    const { api, calls } = await platform()

    await api.project.createWithReferences(PROMPT, ConnectTarget.Cloud, 's-unattached')
    await api.project.confirmWithReferences('p1', { name: 'Crmore', specification: 'Spec' })

    expect(calls.map(call => [call.alias, call.path, call.body, call.timeout])).toEqual([
      [connect.project.createWithReferences, '/connect/project/with-references',
        { prompt: PROMPT, target: ConnectTarget.Cloud, sessionId: 's-unattached' }, TOOL_DEADLINE_MS],
      [connect.project.confirmWithReferences, '/connect/project/:id/confirm-with-references',
        { name: 'Crmore', specification: 'Spec' }, TOOL_DEADLINE_MS],
    ])
  })

  test('create_project and confirm_project use the references routes on a platform that has them', async () => {
    const { api, calls } = await platform()
    const deps = depsOf(api)

    const created = await tool('create_project').run({ prompt: PROMPT }, deps)
    const confirmed = await tool('confirm_project').run({ name: 'Crmore' }, deps)

    expect([created.isError, confirmed.isError]).toEqual([undefined, undefined])
    expect(calls.map(call => call.alias)).toEqual([connect.project.createWithReferences, connect.project.confirmWithReferences])
    expect(calls[0]!.body).toEqual({ prompt: PROMPT, target: ConnectTarget.Cloud })
    expect(deps.attached()).toBe('p1')
  })

  test('an older platform answers 404: the released routes with the same arguments, the 404 asked once', async () => {
    const { api, calls } = await platform({ missing: [connect.project.createWithReferences, connect.project.confirmWithReferences] })
    const deps = depsOf(api)

    await tool('create_project').run({ prompt: PROMPT }, deps)
    await tool('create_project').run({ prompt: 'A second one' }, deps)
    await tool('confirm_project').run({ projectId: 'p1', description: 'Edited' }, deps)

    expect(calls.map(call => call.alias)).toEqual([
      connect.project.createWithReferences, connect.project.create,
      // Remembered for this API: the released routes straight away.
      connect.project.create, connect.project.confirm,
    ])
    expect(calls[1]!.body).toEqual({ prompt: PROMPT, target: ConnectTarget.Cloud })
    expect(calls[3]!.body).toEqual({ description: 'Edited' })
  })

  test('a refusal the platform decided is thrown as it came — never retried on the released route', async () => {
    const domain = await platform({ answer: () => { throw new ProjectNotFound('p404') } })
    const refused = await tool('confirm_project').run({ projectId: 'p404' }, depsOf(domain.api)).catch((e: unknown) => e)

    expect(refused).toBeInstanceOf(ProjectNotFound)
    expect(domain.calls.map(call => call.alias)).toEqual([connect.project.confirmWithReferences])

    // A production body: a bare 404 that names its incident is the platform's refusal too.
    const incident = await platform({ answer: () => { throw new ApiStatusError(404, '0b9a3f52-6a3c-4cbe-9d38-5cc2b6a8f0aa') } })
    await makeReferencesTool(incident.api).confirm('p1', {}).catch(() => null)
    expect(incident.calls.map(call => call.alias)).toEqual([connect.project.confirmWithReferences])
  })

  test('an implementation without the members (written before them) is answered by the released routes', async () => {
    const used: string[] = []
    const legacy = {
      project: {
        create: async () => { used.push('create'); return STATUS },
        confirm: async () => { used.push('confirm'); return STATUS },
      },
    } as unknown as ConnectorApi
    const references = makeReferencesTool(legacy)

    await references.create(PROMPT, ConnectTarget.Local)
    await references.confirm('p1', {})

    expect([used, references.supported()]).toEqual([['create', 'confirm'], false])
  })

  test('a delegated local create still sends the prompt to the references route, with its unattached session', async () => {
    const { api, calls } = await platform()
    const deps = depsOf(api, host({ target: ConnectTarget.Local, llm: ConnectLlm.Local, hasExecutor: true }))

    await tool('create_project').run({ prompt: PROMPT }, deps)

    expect(calls[0]!.alias).toBe(connect.project.createWithReferences)
    expect(calls[0]!.body).toEqual({ prompt: PROMPT, target: ConnectTarget.Local, sessionId: 's1' })
  })

  test('the descriptions say what the platform does with links, research requests and packages', () => {
    expect(tool('create_project').description).toMatch(/public S3 objects, public Google Drive folders/)
    expect(tool('create_project').description).toMatch(/search online/)
    expect(tool('create_project').description).toMatch(/suspicious or look-alike package is refused/)
    expect(tool('confirm_project').description).toMatch(/fetched and researched before the build/)
    expect(tool('list_materials').description).toMatch(/research reports/)
    expect(tool('read_material').description).toMatch(/generated from the project's references/)
  })
})

describe('viable-sdk — list_materials and read_material show the references', () => {
  const CATALOGUE = {
    state: 'drafted', files: 1, bytes: 569, rejected: 0,
    entries: [{
      path: 'links/01-pricing/pricing.md', name: 'pricing.md', size: 569, status: 'catalogued', purpose: 'specification',
    }],
    references: {
      version: 1,
      links: [
        { id: 'l1', url: 'https://s3-stage.owlmeans.link/bucket/public/pricing.md', normalized: 'x', intents: ['content'],
          own: true, origin: 'prompt', status: 'fetched', folder: 'links/01-pricing', files: 1 },
        { id: 'l2', url: 'http://10.0.0.1/admin', normalized: 'y', intents: ['content'], own: false, origin: 'prompt',
          status: 'refused', reason: 'a private address' },
      ],
      research: [
        { id: 'r1', query: 'lead scoring', origin: 'prompt', status: 'researched', doc: 'docs/materials/research/lead-scoring.md', sources: 4 },
      ],
      packages: [
        { name: 'loadsh', origin: 'prompt', verdict: 'suspicious', lookalikeOf: 'lodash', status: 'refused', reason: 'look-alike' },
      ],
    },
    generated: [{ path: 'docs/materials/research/lead-scoring.md', title: 'Lead scoring', kind: 'research' }],
  }

  test('the ledger and the generated documents after the files, and the next read naming a document', async () => {
    const { api } = await platform({ answer: () => CATALOGUE })
    const result = await tool('list_materials').run({ projectId: 'p1' }, depsOf(api, host({ kind: ToolHostKind.Http })))

    expect(result.text).toContain('links/01-pricing/pricing.md · specification · catalogued')
    expect(result.text).toContain('references: 2 link(s), 1 research request(s), 1 package(s)')
    expect(result.text).toContain('link fetched · https://s3-stage.owlmeans.link/bucket/public/pricing.md · links/01-pricing · 1 file(s)')
    expect(result.text).toContain('link refused · http://10.0.0.1/admin — a private address')
    expect(result.text).toContain('research researched · "lead scoring" → docs/materials/research/lead-scoring.md (4 source(s))')
    expect(result.text).toContain('package loadsh · refused · suspicious (looks like lodash) — look-alike')
    expect(result.text).toContain('docs/materials/research/lead-scoring.md · research · Lead scoring')
    expect(result.text).toContain('read_material {"projectId":"p1","path":"docs/materials/research/lead-scoring.md"} a generated document')
    expect(result.structured).toMatchObject({ references: CATALOGUE.references, generated: CATALOGUE.generated })
  })

  test('references alone — nothing uploaded yet — are no project "without files"', async () => {
    const { api } = await platform({
      answer: () => ({ state: 'drafting', files: 0, bytes: 0, rejected: 0, entries: [], references: { ...CATALOGUE.references, packages: [] } }),
    })
    const result = await tool('list_materials').run({ projectId: 'p1' }, depsOf(api))

    expect(result.text).not.toContain('created without files')
    expect(result.text).toContain('research researched')
    expect(result.text).toContain('next: nothing here to read yet')
  })

  test('read_material reads a generated document and says so', async () => {
    const { api, calls } = await platform({
      answer: () => ({ path: 'docs/materials/research/lead-scoring.md', source: ConnectMaterialTextSource.Generated, text: '# Lead scoring', length: 14 }),
    })
    const read = await tool('read_material').run({ projectId: 'p1', path: 'docs/materials/research/lead-scoring.md' }, depsOf(api))

    expect(calls[0]!.query).toEqual({ path: 'docs/materials/research/lead-scoring.md' })
    expect(read.text).toBe('# Lead scoring\n\n[docs/materials/research/lead-scoring.md: a document the platform generated from the project\'s references]')
    expect(read.structured).toMatchObject({ source: 'generated', length: 14 })
  })
})
