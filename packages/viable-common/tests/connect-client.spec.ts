import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { aliasOf, protocols } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { RouteMethod } from '@owlmeans/route'
import {
  connect, CONNECT_CLIENT_HEADER, CONNECT_CLIENT_NO_INFERENCE, CONNECT_CLIENT_RAW_MAX, CONNECT_CLIENT_VERSION_MAX,
  ConnectClientKind, ConnectExecutor, ConnectHarness, ConnectLlm, ConnectPaidGate, ConnectSessionStatus, ConnectTarget,
} from '../src/connect/consts.js'
import { connectClientHelper } from '../src/connect/client.js'
import { connectProtocols } from '../src/connect/entrypoints.js'
import { connectRef } from '../src/connect/references.js'
import { ConnectSessionOpenSchema, ConnectSessionSchema } from '../src/connect/schemas.js'
import * as barrel from '../src/index.js'
import * as connectBarrel from '../src/connect/index.js'

describe('@owlmeans/viable-common — the x-viable-client header', () => {
  test('parses a kind, a kind with its version, and reads an absent or empty header as legacy', () => {
    expect(CONNECT_CLIENT_HEADER).toBe('x-viable-client')
    expect(connectClientHelper.parse('viable-mcp/0.1.19-rc.1')).toEqual({ kind: ConnectClientKind.Mcp, version: '0.1.19-rc.1' })
    expect(connectClientHelper.parse('  viable-claude/1.0.0 ')).toEqual({ kind: ConnectClientKind.Claude, version: '1.0.0' })
    expect(connectClientHelper.parse('sdk')).toEqual({ kind: ConnectClientKind.Sdk })
    expect(connectClientHelper.parse(['hosted-openai/1.0.0', 'sdk'])).toEqual({ kind: ConnectClientKind.HostedOpenai, version: '1.0.0' })
    for (const absent of [undefined, null, '', '   ', []]) {
      expect(connectClientHelper.parse(absent as never)).toEqual({ kind: ConnectClientKind.Legacy })
    }
  })

  test('keeps an unknown kind as other with its raw value, and drops an over-long or empty version', () => {
    expect(connectClientHelper.parse('cursor-plugin/2.0')).toEqual({ kind: ConnectClientKind.Other, raw: 'cursor-plugin/2.0' })
    expect(connectClientHelper.parse('x'.repeat(CONNECT_CLIENT_RAW_MAX + 50)).raw).toHaveLength(CONNECT_CLIENT_RAW_MAX)
    expect(connectClientHelper.parse(`viable-codex/${'1'.repeat(CONNECT_CLIENT_VERSION_MAX + 1)}`))
      .toEqual({ kind: ConnectClientKind.Codex })
    expect(connectClientHelper.parse(`viable-codex/${'1'.repeat(CONNECT_CLIENT_VERSION_MAX)}`).version)
      .toHaveLength(CONNECT_CLIENT_VERSION_MAX)
    expect(connectClientHelper.parse('viable-mcp/')).toEqual({ kind: ConnectClientKind.Mcp })
    // A version may itself carry a slash: everything after the FIRST one is the version.
    expect(connectClientHelper.parse('sdk/a/b')).toEqual({ kind: ConnectClientKind.Sdk, version: 'a/b' })
  })

  test('formats what it parses, an other client as its raw value', () => {
    expect(connectClientHelper.format({ kind: ConnectClientKind.Sdk })).toBe('sdk')
    expect(connectClientHelper.format({ kind: ConnectClientKind.Claude, version: '0.1.19-rc.1' })).toBe('viable-claude/0.1.19-rc.1')
    expect(connectClientHelper.format({ kind: ConnectClientKind.Other, raw: 'cursor-plugin/2.0' })).toBe('cursor-plugin/2.0')
    expect(connectClientHelper.format({ kind: ConnectClientKind.Mcp, version: 'v'.repeat(CONNECT_CLIENT_VERSION_MAX + 1) }))
      .toBe('viable-mcp')
    for (const kind of Object.values(ConnectClientKind).filter(kind => kind !== ConnectClientKind.Other)) {
      const client = { kind, version: '1.2.3' }
      expect(connectClientHelper.parse(connectClientHelper.format(client))).toEqual(client)
    }
  })

  test('only the plugin and listing kinds may never infer — legacy, hosted, other and the SDK may', () => {
    expect([...CONNECT_CLIENT_NO_INFERENCE].sort()).toEqual([
      ConnectClientKind.HostedClaude, ConnectClientKind.HostedOpenai, ConnectClientKind.Claude, ConnectClientKind.Codex,
    ].sort())
    expect(Object.isFrozen(CONNECT_CLIENT_NO_INFERENCE)).toBe(true)
    for (const kind of Object.values(ConnectClientKind)) {
      expect([kind, connectClientHelper.mayInfer(kind)]).toEqual([kind, !CONNECT_CLIENT_NO_INFERENCE.includes(kind)])
    }
    expect(connectClientHelper.mayInfer('something-newer')).toBe(true)
  })
})

describe('@owlmeans/viable-common — connect.client.identify', () => {
  test('is GET /client under the owned base, with no gate of its own even when every paid gate is named', () => {
    const tree = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      accountGate: { alias: 'test-account-gate', params: ['owner'] },
      paid: Object.fromEntries(Object.values(ConnectPaidGate).map(kind => [kind, { alias: `gate-${kind}`, params: [kind] }])),
    })
    const identify = tree.client.identify

    expect(identify.alias).toBe(connect.client.identify)
    expect(connect.client.identify).toBe('viable:manager-api:connect:client:identify')
    expect(`${identify.route.route.method!.toUpperCase()} ${identify.route.route.path}`).toBe('GET /client')
    expect(identify.route.route.method).toBe(RouteMethod.GET)
    expect(aliasOf(identify.route.route.parent!)).toBe(connect.base)
    expect(identify.gate).toBeUndefined()
    expect(protocols(tree).filter(protocol => protocol.alias === connect.client.identify)).toEqual([identify])
    expect(connectRef.client.identify.alias).toBe(connect.client.identify)
  })

  test('the helper, the kinds and the header are exported from the package and the connect barrels', () => {
    for (const exported of [barrel, connectBarrel]) {
      expect(exported.connectClientHelper).toBe(connectClientHelper)
      expect(typeof exported.createConnectClientHelper).toBe('function')
      expect(exported.ConnectClientKind).toBe(ConnectClientKind)
      expect(exported.CONNECT_CLIENT_HEADER).toBe(CONNECT_CLIENT_HEADER)
      expect(exported.CONNECT_CLIENT_VERSION_MAX).toBe(CONNECT_CLIENT_VERSION_MAX)
      expect(exported.CONNECT_CLIENT_NO_INFERENCE).toBe(CONNECT_CLIENT_NO_INFERENCE)
    }
  })
})

describe('@owlmeans/viable-common — the session record names its client, optionally', () => {
  const record = (extra: Record<string, unknown> = {}) => ({
    profileId: 'profile-1',
    entityId: 'entity-1',
    target: ConnectTarget.Local,
    llm: ConnectLlm.Cloud,
    harness: ConnectHarness.ClaudeCode,
    clientVersion: '0.1.19-rc.1',
    capabilities: {
      harness: ConnectHarness.ClaudeCode, tiers: {}, subagents: true, effortControl: false,
      executors: [ConnectExecutor.Files, ConnectExecutor.Human],
    },
    status: ConnectSessionStatus.Active,
    openedAt: new Date(),
    lastSeenAt: new Date(),
    createdAt: new Date(),
    ...extra,
  })

  test('accepts a record without a client and one with each shape of client', () => {
    const validate = new Ajv({ strict: false }).compile(ConnectSessionSchema)

    expect(validate(record())).toBe(true)
    expect(validate(record({ client: { kind: ConnectClientKind.Claude, version: '0.1.19-rc.1' } }))).toBe(true)
    expect(validate(record({ client: { kind: ConnectClientKind.Legacy } }))).toBe(true)
    expect(validate(record({ client: { kind: ConnectClientKind.Other, raw: 'cursor-plugin/2.0' } }))).toBe(true)
    expect(validate(record({ client: connectClientHelper.parse('x'.repeat(500)) }))).toBe(true)
  })

  test('refuses an unknown kind, an over-long version or a stray field in the client', () => {
    const validate = new Ajv({ strict: false }).compile(ConnectSessionSchema)

    expect(validate(record({ client: { kind: 'cursor-plugin' } }))).toBe(false)
    expect(validate(record({ client: { kind: ConnectClientKind.Mcp, version: '1'.repeat(CONNECT_CLIENT_VERSION_MAX + 1) } }))).toBe(false)
    expect(validate(record({ client: { kind: ConnectClientKind.Mcp, token: 'vib_x' } }))).toBe(false)
    expect(validate(record({ client: {} }))).toBe(false)
  })

  test('the open body stays closed to a client field — an older platform would refuse one', () => {
    const open = new Ajv({ strict: false }).compile(ConnectSessionOpenSchema)
    const body = {
      target: ConnectTarget.Local, harness: ConnectHarness.ClaudeCode, clientVersion: '0.1.19-rc.1',
      capabilities: record().capabilities,
    }

    expect(open(body)).toBe(true)
    expect(open({ ...body, client: { kind: ConnectClientKind.Claude } })).toBe(false)
  })
})
