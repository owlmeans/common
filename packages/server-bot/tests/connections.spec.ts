import { describe, expect, test } from 'bun:test'
import {
  BotActionKind, BotConnectionNotFound, BotConnectionStatus, BotCredentialsRejected, BotReceiveMode, BotTransport,
  BotUnsupportedAction,
} from '@owlmeans/bot'
import { BotSecretMissing } from '../src/errors.js'
import { makeTestBotPlatform } from '../src/mock/platform.js'
import { makeTestBot, scopeOf } from './context.js'

const test_ = { platform: 'test', label: 'Moderator' }
const ORIGIN = 'https://shop.example.com'

describe('@owlmeans/server-bot — connections', () => {
  test('a mock connection saves, verifies (polling without a public origin) and removes', async () => {
    const { service, connections, platform } = makeTestBot()
    const scope = scopeOf()

    const saved = await service.connections.save(scope, { ...test_, transport: BotTransport.Mock })
    expect([saved.status, saved.transport, saved.receive, saved.credentialsSet]).toEqual(
      [BotConnectionStatus.Pending, BotTransport.Mock, BotReceiveMode.Webhook, []]
    )
    const verified = await service.connections.verify(scope, saved.id, 'http://localhost:3000')
    expect(verified.status).toBe(BotConnectionStatus.Connected)
    expect(verified.receive).toBe(BotReceiveMode.Poll)
    expect(verified.identity?.username).toMatch(/^mock_[A-Za-z0-9]+_bot$/)
    expect(verified.hookUrl).toBe(`http://localhost:3000/api/bot/hook/test/${saved.id}`)
    expect(verified.setup?.length).toBeGreaterThan(0)
    expect(platform.mock.calls(saved.id).map(call => call.method)).toEqual(['me'])

    expect(await service.connections.remove(scope, saved.id)).toEqual({ id: saved.id })
    expect(await connections.load(saved.id)).toBeNull()
    await expect(service.connections.get(scope, saved.id)).rejects.toBeInstanceOf(BotConnectionNotFound)
  })

  test('a public HTTPS origin registers the webhook with the connection\'s hook secret; removing unregisters it', async () => {
    const { service, connections, platform } = makeTestBot()
    const scope = scopeOf()
    const saved = await service.connections.save(scope, { ...test_, transport: BotTransport.Mock }, ORIGIN)

    const verified = await service.connections.verify(scope, saved.id, ORIGIN)
    const hookSecret = (await connections.get(saved.id)).hookSecret
    const setHook = platform.mock.calls(saved.id).find(call => call.method === 'setHook')

    expect(verified.receive).toBe(BotReceiveMode.Webhook)
    expect(setHook?.params).toEqual({ url: `${ORIGIN}/api/bot/hook/test/${saved.id}`, secret: hookSecret })
    expect(JSON.stringify(verified)).not.toContain(hookSecret)

    await service.connections.remove(scope, saved.id)
    expect(platform.mock.calls(saved.id).at(-1)?.method).toBe('deleteHook')
  })

  test('a gateway platform verifies to gateway; a manual one lists its hook URL and generated credential to paste', async () => {
    const gateway = makeTestBotPlatform({ platform: 'socket', receive: [BotReceiveMode.Gateway] })
    const manual = makeTestBotPlatform({
      platform: 'console',
      setup: 'manual',
      receive: [BotReceiveMode.Webhook],
      credentials: [
        { key: 'token', secret: true, required: true, label: { en: 'Token' } },
        { key: 'verifyToken', secret: true, required: true, generated: true, label: { en: 'Verify token' } },
      ],
    })
    const { service, connections } = makeTestBot({ platforms: [gateway, manual] })
    const scope = scopeOf()

    const socket = await service.connections.save(scope, { platform: 'socket', label: 'Socket', transport: BotTransport.Mock })
    expect((await service.connections.verify(scope, socket.id, ORIGIN)).receive).toBe(BotReceiveMode.Gateway)

    const saved = await service.connections.save(scope, { platform: 'console', label: 'Console', transport: BotTransport.Mock }, ORIGIN)
    const verified = await service.connections.verify(scope, saved.id, ORIGIN)
    const hookSecret = (await connections.get(saved.id)).hookSecret
    expect(verified.receive).toBe(BotReceiveMode.Webhook)
    // The generated credential counts as set (it defaults to the hook secret) and is never typed.
    expect(verified.credentialsSet).toEqual(['verifyToken'])
    expect(verified.setup).toEqual([`Callback URL: ${ORIGIN}/api/bot/hook/console/${saved.id}`, `Verify token: ${hookSecret}`])
    expect(manual.mock.calls(saved.id).some(call => call.method === 'setHook')).toBe(false)
  })

  test('credentials are sealed, never returned, kept when omitted and cleared by an empty value', async () => {
    const { service, connections } = makeTestBot()
    const scope = scopeOf()
    const saved = await service.connections.save(scope, { ...test_, credentials: { token: '42:SECRET' } })
    const record = await connections.get(saved.id)

    expect(saved.credentialsSet).toEqual(['token'])
    expect(JSON.stringify(saved)).not.toContain('42:SECRET')
    expect(JSON.stringify(record)).not.toContain('42:SECRET')

    const renamed = await service.connections.save(scope, { id: saved.id, ...test_, label: 'Renamed' })
    expect([renamed.label, renamed.credentialsSet, renamed.status]).toEqual(['Renamed', ['token'], BotConnectionStatus.Pending])
    const cleared = await service.connections.save(scope, { id: saved.id, ...test_, credentials: { token: '' } })
    expect(cleared.credentialsSet).toEqual([])
    expect((await connections.get(saved.id)).sealed).toBeNull()
    await expect(service.connections.save(scope, { ...test_, credentials: { password: 'x' } }))
      .rejects.toBeInstanceOf(BotCredentialsRejected)
  })

  test('without a secret credentials are refused; a mock connection without credentials still works', async () => {
    const { service } = makeTestBot({ secret: () => undefined })
    const scope = scopeOf()

    await expect(service.connections.save(scope, { ...test_, credentials: { token: '42:SECRET' } }))
      .rejects.toBeInstanceOf(BotSecretMissing)
    const mock = await service.connections.save(scope, { ...test_, transport: BotTransport.Mock, credentials: { token: '' } })
    expect((await service.connections.verify(scope, mock.id)).status).toBe(BotConnectionStatus.Connected)
  })

  test('the default secret is APP_SECRET', async () => {
    const previous = process.env.APP_SECRET
    process.env.APP_SECRET = 'from-the-environment'
    try {
      const { service } = makeTestBot({ secret: undefined })
      const saved = await service.connections.save(scopeOf(), { ...test_, credentials: { token: '1:x' } })
      expect(saved.credentialsSet).toEqual(['token'])
    } finally {
      if (previous == null) {
        delete process.env.APP_SECRET
      } else {
        process.env.APP_SECRET = previous
      }
    }
  })

  test('a live connection without its token fails verification and says so', async () => {
    const { service } = makeTestBot()
    const scope = scopeOf()
    const saved = await service.connections.save(scope, test_)

    await expect(service.connections.verify(scope, saved.id)).rejects.toBeInstanceOf(BotCredentialsRejected)
    const failed = await service.connections.get(scope, saved.id)
    expect([failed.status, failed.lastError]).toEqual([BotConnectionStatus.Failed, 'bot:credentials-rejected:missing:token'])
  })

  test('a live token the platform refuses fails verification as rejected credentials', async () => {
    const { service } = makeTestBot({
      fetch: async () => Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 }),
    })
    const scope = scopeOf()
    const saved = await service.connections.save(scope, { ...test_, credentials: { token: 'revoked' } })

    await expect(service.connections.verify(scope, saved.id)).rejects.toBeInstanceOf(BotCredentialsRejected)
    expect((await service.connections.get(scope, saved.id)).lastError).toBe('bot:credentials-rejected:test:401:Unauthorized')
  })

  test('connections are scoped: another scope neither lists nor reaches them', async () => {
    const { service } = makeTestBot()
    const [mine, theirs] = [scopeOf(), scopeOf()]
    const saved = await service.connections.save(mine, { ...test_, transport: BotTransport.Mock })

    expect((await service.connections.list(mine)).map(connection => connection.id)).toEqual([saved.id])
    expect(await service.connections.list(theirs)).toEqual([])
    await expect(service.connections.verify(theirs, saved.id)).rejects.toBeInstanceOf(BotConnectionNotFound)
    await expect(service.connections.remove(theirs, saved.id)).rejects.toBeInstanceOf(BotConnectionNotFound)
    await expect(service.connections.save(theirs, { id: saved.id, ...test_ })).rejects.toBeInstanceOf(BotConnectionNotFound)
  })

  test('a platform with no registered plugin is refused; the platform of a connection never changes', async () => {
    const { service } = makeTestBot({ platforms: [makeTestBotPlatform(), makeTestBotPlatform({ platform: 'other' })] })
    const scope = scopeOf()

    const missing = service.connections.save(scope, { platform: 'absent', label: 'Shop' })
    await expect(missing).rejects.toBeInstanceOf(BotUnsupportedAction)
    await expect(missing).rejects.toThrow('bot:unsupported-action:platform-not-implemented:absent')
    const saved = await service.connections.save(scope, { ...test_, transport: BotTransport.Mock })
    await expect(service.connections.save(scope, { id: saved.id, platform: 'other', label: 'x' }))
      .rejects.toBeInstanceOf(BotUnsupportedAction)
  })

  test('disabling a connection marks it disabled; enabling it again needs a new verification', async () => {
    const { service } = makeTestBot()
    const scope = scopeOf()
    const saved = await service.connections.save(scope, { ...test_, transport: BotTransport.Mock })
    await service.connections.verify(scope, saved.id)

    const disabled = await service.connections.save(scope, { id: saved.id, ...test_, enabled: false })
    expect([disabled.enabled, disabled.status]).toEqual([false, BotConnectionStatus.Disabled])
    const enabled = await service.connections.save(scope, { id: saved.id, ...test_, enabled: true })
    expect(enabled.status).toBe(BotConnectionStatus.Pending)
  })

  test('an optional credential that enables an action adds it, and that call authorizes with it', async () => {
    const platform = makeTestBotPlatform({
      actions: [BotActionKind.Reply, BotActionKind.Send],
      credentials: [
        { key: 'token', secret: true, required: true, label: { en: 'Token' } },
        { key: 'adminToken', secret: true, required: false, enables: [BotActionKind.Delete], label: { en: 'Admin token' } },
      ],
    })
    const { service } = makeTestBot({ platforms: [platform] })
    const scope = scopeOf()
    const saved = await service.connections.save(scope, { ...test_, transport: BotTransport.Mock, credentials: { token: 't-1' } })
    const without = await service.actions({ scope, connection: saved.id })
    expect(await without.delete({ chat: 'c-1', id: 'm-1' })).toEqual({
      ok: false, error: 'Test can delete messages only with the adminToken credential.', code: 'bot:unsupported-action:delete',
    })

    await service.connections.save(scope, { id: saved.id, ...test_, credentials: { adminToken: 'a-1' } })
    const withAdmin = await service.actions({ scope, connection: saved.id })
    expect([withAdmin.supports(BotActionKind.Delete), (await withAdmin.delete({ chat: 'c-1', id: 'm-1' })).ok]).toEqual([true, true])
    expect(platform.mock.calls(saved.id).find(call => call.method === 'deleteMessage')?.auth).toBe('adminToken')
  })
})
