import { expect, test } from 'bun:test'
import { WorkcardKind } from '@owlmeans/planning'
import { definitionProtocols, makeSuite, STORY_FLOW, tick } from './context.js'
import { makeBarrier } from './lifecycle/context.js'

test('a stale schema write rejects without invalidating the fresh organization registry', async () => {
  let identity = 'organization-a'
  const pause = makeBarrier()
  const suite = await makeSuite({ definitions: true, schemas: false, entityId: () => identity, scopeKey: () => identity,
    after: async call => { if (call.alias === definitionProtocols.schema.define!.alias) await pause.hold() },
  })
  const definitions = suite.planning.definitions!
  const writing = definitions.define({ types: [{ type: 'test:old-type', kind: WorkcardKind.Card, version: 1,
    fields: { type: 'object' }, flows: [STORY_FLOW], specifications: [] }] })
  void writing.catch(() => {})
  await pause.entered
  await suite.client.planning().close()
  await expect(writing).rejects.toThrow('scope-changed')
  identity = 'organization-b'
  const fresh = await definitions.registry()
  const reads = suite.calls.filter(call => call.alias === definitionProtocols.schema.list.alias).length
  pause.release(); await tick(10)
  expect(await definitions.registry()).toBe(fresh)
  expect(suite.calls.filter(call => call.alias === definitionProtocols.schema.list.alias)).toHaveLength(reads)
  expect(fresh.bundle().types.some(type => type.type === 'test:old-type')).toBe(false)
  expect((await suite.local.definitions!.bundle()).types.some(type => type.type === 'test:old-type')).toBe(true)
  await suite.client.planning().close()
})
