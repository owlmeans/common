import { describe, expect, test } from 'bun:test'
import { CommitState, TransitionAction } from '@owlmeans/planning'
import { CONNECT_TOKEN_PREFIX, connect, VIABLE_STORY_TYPE } from '@owlmeans/viable-common'

import { isTransientTransportError, makeRemoteConnectorApi, recoverLongPoll } from '../src/api/remote.js'
import { COMMIT_POLL_SEC, COMMIT_WAIT_MS, TOOL_DEADLINE_MS } from '../src/consts.js'
import { makeSdkContext } from '../src/context/index.js'
import { storyQuery } from '../src/tools/stories.js'
import { captureTransport } from './context.js'

describe('viable-sdk — remote transport recovery', () => {
  test('recognises a reset on the error or its fetch cause', () => {
    const direct = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' })
    const nested = new TypeError('fetch failed', { cause: direct })

    expect(isTransientTransportError(direct)).toBe(true)
    expect(isTransientTransportError(nested)).toBe(true)
    expect(isTransientTransportError(new Error('project was refused'))).toBe(false)
  })

  test('answers a dropped long poll from one immediate durable snapshot', async () => {
    const calls: string[] = []
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
    const result = await recoverLongPoll(
      async () => { calls.push('poll'); throw reset },
      async () => { calls.push('snapshot'); return { status: 'running' } },
    )

    expect(result).toEqual({ status: 'running' })
    expect(calls).toEqual(['poll', 'snapshot'])
  })

  test('does not retry a platform refusal', async () => {
    let snapshots = 0
    const refusal = new Error('Forbidden')

    await expect(recoverLongPoll(
      async () => { throw refusal },
      async () => { snapshots++; return 'wrong' },
    )).rejects.toBe(refusal)
    expect(snapshots).toBe(0)
  })
})

describe('viable-sdk — the remote project settings', () => {
  test('read and save one record over the connector routes, under the tool deadline', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const stored = {
      copyright: '© 2026 Acme', organizationName: 'Acme', termsUrl: '/terms', privacyUrl: '/privacy',
      googleTag: '',
    }
    const calls = captureTransport(context, call =>
      call.body != null ? { ...stored, ...(call.body as object) } : stored)
    const api = makeRemoteConnectorApi(context)

    expect(await api.projectBranding('p1')).toEqual(stored)
    const saved = await api.saveProjectBranding('p1', { googleTag: 'GTM-ABC1234' })

    expect(saved.googleTag).toBe('GTM-ABC1234')
    expect(calls.map(call => [call.alias, call.path, call.timeout])).toEqual([
      [connect.project.branding.get, '/connect/project/:id/branding', TOOL_DEADLINE_MS],
      [connect.project.branding.save, '/connect/project/:id/branding', TOOL_DEADLINE_MS],
    ])
    // The patch crosses as given: a field it did not name is not sent, so it keeps its stored value.
    expect(calls[1]!.body).toEqual({ googleTag: 'GTM-ABC1234' })
  })
})

describe('viable-sdk — the remote planning facade', () => {
  test('is the context\'s planning client: one bound route per call, each under the tool deadline', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const card = { id: 'c1', kind: 'card', type: VIABLE_STORY_TYPE, status: 'in-progress', seq: 2 }
    const transition = {
      id: 't1', card: 'c1', seq: 2, action: TransitionAction.Transit, commit: { state: CommitState.Pending },
    }
    const calls = captureTransport(context, call => {
      if (call.alias.endsWith(':card:list')) return { items: [], total: 0 }
      if (call.alias.endsWith(':execute')) return { transition }
      // The first read of a commit does not hold; the next one holds and sees it land.
      return Number(call.query.wait) === 0
        ? { transition: 't1', state: CommitState.Pending }
        : { transition: 't1', state: CommitState.Committed, card }
    })
    const { planning } = makeRemoteConnectorApi(context)

    await planning.cards.list(storyQuery('p1', { area: 'user' }))
    const receipt = await planning.execute({
      card: 'c1', action: TransitionAction.Transit, transition: 'start', actor: { agent: 'forged' },
    }, { wait: true, timeout: COMMIT_WAIT_MS })

    expect(receipt.card).toEqual(card as never)
    expect(calls.map(call => [call.path, call.timeout])).toEqual([
      ['/planning/cards', TOOL_DEADLINE_MS],
      ['/planning/execute', TOOL_DEADLINE_MS],
      ['/planning/commits/:transition', TOOL_DEADLINE_MS],
      // A hold outlasts its own wait by ten seconds, or every quiet poll reads as a dropped line.
      ['/planning/commits/:transition', (COMMIT_POLL_SEC + 10) * 1000],
    ])
    // The query crosses in its wire shape, and the actor never crosses at all.
    expect(calls[0]!.query).toMatchObject({ parent: 'p1', type: VIABLE_STORY_TYPE, fields: '{"area":"user"}' })
    expect(calls[1]!.body).not.toHaveProperty('actor')
  })
})
