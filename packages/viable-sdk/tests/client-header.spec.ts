import { describe, expect, test } from 'bun:test'
import { ApiStatusError, ServerCrashedError } from '@owlmeans/api'
import { CommitState, TransitionAction } from '@owlmeans/planning'
import {
  CONNECT_CALL_HEADER, CONNECT_CLIENT_HEADER, CONNECT_TOKEN_PREFIX, ConnectCallState, ConnectClientKind, ConnectLlm, connect,
  connectRef, VIABLE_STORY_TYPE, type ConnectClient,
} from '@owlmeans/viable-common'

import { makeRemoteConnectorApi } from '../src/api/remote.js'
import { makeSdkContext } from '../src/context/index.js'
import { accepted, captureTransport, type CapturedCall } from './context.js'

/** Port 9 is discard: a call that escaped the captured client would say so. */
const contextOf = async (llm?: ConnectLlm, client?: ConnectClient) => await makeSdkContext({
  apiUrl: 'http://127.0.0.1:9',
  token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
  ...(llm != null ? { llm } : {}),
  ...(client != null ? { client } : {}),
})

const projectStatus = (id: string) => ({
  project: { id, name: 'Store finder', alias: 'store-finder', status: 'draft', intrinsic: 'planned' },
  agent: { locked: false },
  local: true,
  updatedAt: '2026-10-06T00:00:00.000Z',
})

const clientOf = (call: CapturedCall): unknown => call.headers?.[CONNECT_CLIENT_HEADER]

const answer = (call: CapturedCall): unknown => call.alias.endsWith(':card:list')
  ? { items: [], total: 0 }
  : call.alias.endsWith(':execute')
    ? { transition: { id: 't1', card: 'c1', seq: 1, action: TransitionAction.Create, commit: { state: CommitState.Committed } } }
    : call.alias === connect.slot.list ? [] : projectStatus('p1')

describe('viable-sdk — every request names its edition in x-viable-client', () => {
  test('connector reads and writes and planning reads and executes, in every mode — `sdk` by default', async () => {
    for (const llm of [undefined, ConnectLlm.Cloud, ConnectLlm.Local]) {
      const context = await contextOf(llm)
      const calls = captureTransport(context, answer)
      const api = makeRemoteConnectorApi(context)

      await api.project.create('a store finder')
      await api.project.status('p1')
      await api.slot.list()
      await api.planning.cards.list({ parent: 'p1' } as never)
      await api.planning.execute({ action: TransitionAction.Create, card: { kind: 'card', type: VIABLE_STORY_TYPE, parent: 'p1', title: 'x' } } as never)

      expect(calls.map(call => [call.alias, clientOf(call)])).toEqual([
        [connect.project.create, 'sdk'],
        [connect.project.status, 'sdk'],
        [connect.slot.list, 'sdk'],
        [expect.stringContaining(':card:list'), 'sdk'],
        [expect.stringContaining(':execute'), 'sdk'],
      ])
    }
  })

  test('a named edition is sent as <kind>/<version> on connector and planning calls alike', async () => {
    for (const llm of [ConnectLlm.Cloud, ConnectLlm.Local]) {
      const context = await contextOf(llm, { kind: ConnectClientKind.Claude, version: '0.1.19-rc.1' })
      const calls = captureTransport(context, answer)
      const api = makeRemoteConnectorApi(context)

      await api.project.modify('p1', 'blue accents')
      await api.planning.cards.list({ parent: 'p1' } as never)

      expect(calls.map(clientOf)).toEqual(['viable-claude/0.1.19-rc.1', 'viable-claude/0.1.19-rc.1'])
    }
  })

  test('a collect hop names the edition too, and a header the caller spelled differently is replaced', async () => {
    const context = await contextOf(ConnectLlm.Local, { kind: ConnectClientKind.Mcp, version: '0.1.19-rc.1' })
    const calls = captureTransport(context, call => call.alias === connect.project.modify
      ? accepted({ pending: String(call.headers?.[CONNECT_CALL_HEADER]) })
      : { state: ConnectCallState.Settled, outcome: 'ok', value: projectStatus('p1') })

    await context.entrypoint(connectRef.project.modify).call({
      params: { id: 'p1' }, body: { prompt: 'x' }, headers: { 'X-Viable-Client': 'spoofed/9' },
    } as never)

    expect(calls.map(call => call.alias)).toEqual([connect.project.modify, connect.call.collect])
    for (const call of calls) {
      expect(call.headers).toMatchObject({ [CONNECT_CLIENT_HEADER]: 'viable-mcp/0.1.19-rc.1' })
      expect(Object.keys(call.headers ?? {}).filter(key => key.toLowerCase() === CONNECT_CLIENT_HEADER)).toHaveLength(1)
    }
  })
})

describe('viable-sdk — ConnectorApi.client()', () => {
  test('reads GET /connect/client under the tool deadline', async () => {
    const context = await contextOf()
    const view = { kind: 'sdk', via: 'connect', inference: true }
    const calls = captureTransport(context, () => view)

    expect(await makeRemoteConnectorApi(context).client()).toEqual(view)
    expect(calls.map(call => [call.alias, call.path, clientOf(call)])).toEqual([[connect.client.identify, '/connect/client', 'sdk']])
  })

  test('a platform older than the route (404) answers null; any other failure is thrown', async () => {
    const context = await contextOf()
    let thrown: Error = new ApiStatusError(404)
    captureTransport(context, () => { throw thrown })
    const api = makeRemoteConnectorApi(context)

    expect(await api.client()).toBeNull()
    thrown = Object.assign(new ApiStatusError(404), { responseStatus: 404 })
    expect(await api.client()).toBeNull()
    thrown = new ServerCrashedError('incident-1')
    await expect(api.client()).rejects.toThrow('crashed')
    thrown = new ApiStatusError(403)
    await expect(api.client()).rejects.toThrow('status:403')
  })
})
