import { expect, test } from 'bun:test'
import { connect, type BlueprintCatalogue, ConnectHarness, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'
import { makeSdkContext } from '../src/context/index.js'
import { makeRemoteConnectorApi } from '../src/api/remote.js'
import { catalogueHelper } from '../src/tools/catalogue.js'
import { serverInstructions } from '../src/tools/mcp.js'
import { ToolHostKind } from '../src/tools/consts.js'
import type { ToolDeps } from '../src/tools/types.js'
import { captureTransport } from './context.js'

const installed: BlueprintCatalogue = { version: 1, defaultBlueprintId: 'custom', blueprints: [{
  id: 'custom', title: 'Installed target', language: 'TypeScript', runtime: 'Bun', framework: 'OwlMeans',
  capabilities: { postgres: true, kv: true, queue: false, worker: false, agents: false, validation: true, marketingConsent: true },
  cases: [{ id: 'crm-custom', title: 'CRM', description: 'Tenant customer work', tenancy: 'multiple-organizations',
    capabilities: { postgres: true, kv: true, queue: false, worker: false, agents: false, validation: true, marketingConsent: true },
    categoryKind: 'work', categories: [{ id: 'crm', title: 'Customer relationships', description: 'Customer opportunities', records: ['Opportunity'], aliases: ['CRM'] }], planningResources: ['assignee', 'team', 'comment'] }],
}] }

test('reads the installed registry under account authentication before a project or session exists', async () => {
  const context = await makeSdkContext({ apiUrl: 'http://127.0.0.1:9', token: 'vib_offline_test_token' })
  const calls = captureTransport(context, () => installed)
  const api = makeRemoteConnectorApi(context)
  const tool = catalogueHelper.toolByName('describe_blueprints')!
  const host = { kind: ToolHostKind.Stdio, target: ConnectTarget.Local, llm: ConnectLlm.Cloud, harness: ConnectHarness.Codex, hasExecutor: true }
  const deps = { api, host, attached: () => null, session: () => { throw new Error('must not open a session') }, log: () => {} } as unknown as ToolDeps
  const answer = await tool.run({}, deps)
  expect(answer.structured).toEqual(installed)
  expect(answer.text).toContain('crm-custom: CRM (multiple-organizations)')
  expect(answer.text).toContain('crm: Customer relationships')
  expect(answer.text).toContain('planning: assignee, team, comment')
  expect(calls.map(call => [call.alias, call.path])).toEqual([[connect.account.blueprints, '/connect/account/blueprints']])
  const instructions = serverInstructions({ host })
  for (const name of ['describe_blueprints', 'web', 'scalable', 'ai-pipeline', 'ai-agent', 'game', 'work-management', 'work-management-tenanted', 'CRM', 'recruiting', 'inventory']) expect(instructions).toContain(name)
})
