import { afterEach, describe, expect, test } from 'bun:test'
import type { Server, ServerWebSocket } from 'bun'
import { BotConnectionStatus, BotPlatform, BotReceiveMode, BotTransport } from '@owlmeans/bot'
import { DISCORD_GATEWAY_INTENTS, DISCORD_RESUME_CLOSE_CODE } from '../src/platforms/discord/consts.js'
import { DiscordGatewayError } from '../src/platforms/discord/errors.js'
import { makeDiscordBotPlatform } from '../src/platforms/discord/plugin.js'
import type { BotPlatformSession } from '../src/platforms/types.js'
import { until } from './context.js'

/**
 * The LIVE gateway client against a local WebSocket server that speaks the gateway protocol — the
 * only socket these tests open, on 127.0.0.1.
 */
interface Frame { op: number, d?: any, s?: number | null, t?: string | null }
interface Peer { path: string, frames: Frame[], close?: number }
type Script = (ws: ServerWebSocket<{ peer: Peer }>, frame: Frame, peers: Peer[]) => void

const servers: Server<any>[] = []
afterEach(() => { servers.splice(0).forEach(server => server.stop(true)) })

const send = (ws: ServerWebSocket<unknown>, frame: Frame): void => { ws.send(JSON.stringify({ s: null, t: null, ...frame })) }

const message = (s: number, id: string, content: string): Frame => ({
  op: 0, s, t: 'MESSAGE_CREATE',
  d: {
    id, channel_id: '800000000000000002', guild_id: '800000000000000001', content, type: 0,
    author: { id: '700000000000000001', username: 'annlee', global_name: 'Ann Lee' },
    timestamp: '2026-10-26T12:00:00.000000+00:00', edited_timestamp: null, mentions: [],
  },
})

const gateway = (script: Script, heartbeatMs: number = 40) => {
  const peers: Peer[] = []
  const server = Bun.serve<{ peer: Peer }>({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request, srv) => {
      const peer: Peer = { path: new URL(request.url).pathname + new URL(request.url).search, frames: [] }
      return srv.upgrade(request, { data: { peer } }) ? undefined : new Response('upgrade required', { status: 426 })
    },
    websocket: {
      open: ws => {
        peers.push(ws.data.peer)
        send(ws, { op: 10, d: { heartbeat_interval: heartbeatMs } })
      },
      message: (ws, raw) => {
        const frame = JSON.parse(String(raw)) as Frame
        ws.data.peer.frames.push(frame)
        script(ws, frame, peers)
      },
      close: (ws, code) => { ws.data.peer.close = code },
    },
  })
  servers.push(server)
  const origin = `ws://127.0.0.1:${server.port}`
  const gets: string[] = []
  const session: BotPlatformSession = {
    connection: {
      id: 'live-1', scope: 'org', platform: BotPlatform.Discord, label: 'Warden', transport: BotTransport.Live,
      status: BotConnectionStatus.Connected, enabled: true, receive: BotReceiveMode.Gateway,
      identity: { id: '900000000000000001', username: 'warden' }, credentialsSet: ['applicationId', 'token'],
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      credentials: { token: 'live-token', applicationId: '900000000000000001' }, hookSecret: 'x',
    },
    transport: BotTransport.Live,
    fetch: async url => {
      gets.push(url)
      return new Response(JSON.stringify({
        url: `${origin}/`, shards: 1, session_start_limit: { total: 1000, remaining: 999, reset_after: 0, max_concurrency: 1 },
      }))
    },
  }

  return { peers, origin, gets, session }
}

const plugin = makeDiscordBotPlatform({ reconnectMs: 5 })

describe('@owlmeans/server-bot — Discord gateway client (live loop over a local socket)', () => {
  test('hello → identify → ready → dispatch, heartbeats acked, op 7 → resume on resume_gateway_url → replay; abort closes 1000', async () => {
    const world = gateway((ws, frame, peers) => {
      const first = peers.length === 1
      if (frame.op === 1) {
        send(ws, { op: 11 })
        // Two acknowledged beats on the first socket, then the gateway asks for a reconnect.
        if (first && ws.data.peer.frames.filter(sent => sent.op === 1).length === 2) {
          send(ws, { op: 7, d: null })
        }
      } else if (frame.op === 2) {
        send(ws, { op: 0, s: 1, t: 'READY', d: { v: 10, user: { id: '900000000000000001', username: 'warden' }, session_id: 'session-1', resume_gateway_url: `${world.origin}/resume` } })
        send(ws, message(2, '1300000000000000001', 'first'))
        send(ws, { op: 0, s: 3, t: 'TYPING_START', d: {} })
      } else if (frame.op === 6) {
        send(ws, message(4, '1300000000000000002', 'missed while away'))
        send(ws, { op: 0, s: 5, t: 'RESUMED', d: null })
      }
    })
    const emitted: any[] = []
    const controller = new AbortController()
    const running = plugin.receiver!(world.session, async payload => { emitted.push(payload) }, controller.signal)

    await until(async () => emitted.length === 2)
    controller.abort()
    await running

    expect(emitted.map(frame => [frame.t, frame.d.content])).toEqual([['MESSAGE_CREATE', 'first'], ['MESSAGE_CREATE', 'missed while away']])
    expect(world.gets).toEqual(['https://discord.com/api/v10/gateway/bot'])
    const [identified, resumed] = world.peers
    expect(identified.path).toBe('/?v=10&encoding=json')
    expect(identified.frames.find(frame => frame.op === 2)?.d).toMatchObject({
      token: 'live-token', intents: DISCORD_GATEWAY_INTENTS, properties: { browser: 'owlmeans', device: 'owlmeans' },
    })
    // Each beat reports the last sequence received (none yet when a jittered first beat precedes READY).
    const beats = identified.frames.filter(frame => frame.op === 1).map(frame => frame.d)
    expect([beats.length, beats.every(seq => seq === null || seq === 3), beats.at(-1)]).toEqual([2, true, 3])
    expect(resumed.path).toBe('/resume?v=10&encoding=json')
    expect(resumed.frames.find(frame => frame.op === 6)?.d).toEqual({ token: 'live-token', session_id: 'session-1', seq: 3 })
    expect(resumed.frames.some(frame => frame.op === 2)).toBe(false)
    await until(async () => resumed.close != null)
    expect([identified.close, resumed.close]).toEqual([DISCORD_RESUME_CLOSE_CODE, 1000])
  })

  test('a heartbeat that is never acked is a zombie: the client closes resumably and resumes', async () => {
    const world = gateway((ws, frame, peers) => {
      if (frame.op === 1 && peers.length > 1) {
        send(ws, { op: 11 })
      } else if (frame.op === 2) {
        send(ws, { op: 0, s: 1, t: 'READY', d: { session_id: 'session-z', resume_gateway_url: `${world.origin}/resume` } })
      } else if (frame.op === 6) {
        send(ws, { op: 0, s: 2, t: 'RESUMED', d: null })
        send(ws, message(3, '1300000000000000003', 'after the zombie'))
      }
    }, 20)
    const emitted: any[] = []
    const controller = new AbortController()
    const running = plugin.receiver!(world.session, async payload => { emitted.push(payload) }, controller.signal)

    await until(async () => emitted.length === 1)
    controller.abort()
    await running
    expect(world.peers[0].close).toBe(DISCORD_RESUME_CLOSE_CODE)
    expect(world.peers[1].frames.find(frame => frame.op === 6)?.d).toEqual({ token: 'live-token', session_id: 'session-z', seq: 1 })
  })

  test('op 9 with d:false identifies anew; close 4014 (intents) ends the receiver with a clear error', async () => {
    const world = gateway((ws, frame, peers) => {
      if (frame.op === 1) {
        send(ws, { op: 11 })
      } else if (frame.op === 2 && peers.length === 1) {
        send(ws, { op: 9, d: false })
      } else if (frame.op === 2) {
        ws.close(4014, 'Disallowed intent(s).')
      }
    })
    const failure = await plugin.receiver!(world.session, async () => undefined, new AbortController().signal).catch(error => error)

    expect(failure).toBeInstanceOf(DiscordGatewayError)
    expect([failure.message, failure.code]).toEqual(['bot:discord-gateway:4014:disallowed-intents', 4014])
    expect(world.gets.length).toBe(2)
    expect(world.peers.map(peer => peer.frames.filter(frame => frame.op === 2).length)).toEqual([1, 1])
  })

  test('close 4004 (a wrong token) is not retried', async () => {
    const world = gateway((ws, frame) => {
      if (frame.op === 2) {
        ws.close(4004, 'Authentication failed.')
      }
    })

    await expect(plugin.receiver!(world.session, async () => undefined, new AbortController().signal))
      .rejects.toThrow('bot:discord-gateway:4004:authentication-failed')
    expect(world.peers.length).toBe(1)
  })
})
