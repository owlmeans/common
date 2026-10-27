import { describe, expect, test } from 'bun:test'
import {
  BotConnectionNotFound, BotConnectionStatus, BotCredentialsRejected, BotPlatform, BotReceiveMode, BotTransport,
  BotUnsupportedAction,
} from '@owlmeans/bot'
import { BotSecretMissing } from '../src/errors.js'
import { telegramBotPlatform } from '../src/platforms/telegram/plugin.js'
import { makeTestBot, scopeOf } from './context.js'

const telegram = { platform: BotPlatform.Telegram, label: 'Moderator' }
const ORIGIN = 'https://shop.example.com'

describe('@owlmeans/server-bot — connections', () => {
  test('a mock Telegram connection saves, verifies (polling without a public origin) and removes', async () => {
    const { service, connections } = makeTestBot()
    const scope = scopeOf()

    const saved = await service.connections.save(scope, { ...telegram, transport: BotTransport.Mock })
    expect([saved.status, saved.transport, saved.receive, saved.credentialsSet]).toEqual(
      [BotConnectionStatus.Pending, BotTransport.Mock, BotReceiveMode.Webhook, []]
    )
    const verified = await service.connections.verify(scope, saved.id, 'http://localhost:3000')
    expect(verified.status).toBe(BotConnectionStatus.Connected)
    expect(verified.receive).toBe(BotReceiveMode.Poll)
    expect(verified.identity?.username).toMatch(/^mock_[A-Za-z0-9]+_bot$/)
    expect(verified.hookUrl).toBe(`http://localhost:3000/api/bot/hook/telegram/${saved.id}`)
    expect(verified.setup?.length).toBeGreaterThan(0)
    expect(telegramBotPlatform.mock.calls(saved.id).map(call => call.method)).toEqual(['getMe'])

    expect(await service.connections.remove(scope, saved.id)).toEqual({ id: saved.id })
    expect(await connections.load(saved.id)).toBeNull()
    await expect(service.connections.get(scope, saved.id)).rejects.toBeInstanceOf(BotConnectionNotFound)
  })

  test('a public HTTPS origin registers the webhook with the connection\'s secret token; removing unregisters it', async () => {
    const { service, connections } = makeTestBot()
    const scope = scopeOf()
    const saved = await service.connections.save(scope, { ...telegram, transport: BotTransport.Mock }, ORIGIN)

    const verified = await service.connections.verify(scope, saved.id, ORIGIN)
    const hookSecret = (await connections.get(saved.id)).hookSecret
    const setWebhook = telegramBotPlatform.mock.calls(saved.id).find(call => call.method === 'setWebhook')

    expect(verified.receive).toBe(BotReceiveMode.Webhook)
    expect(setWebhook?.params).toEqual({
      url: `${ORIGIN}/api/bot/hook/telegram/${saved.id}`, secret_token: hookSecret,
      allowed_updates: ['message', 'edited_message', 'channel_post'],
    })
    expect(JSON.stringify(verified)).not.toContain(hookSecret)

    await service.connections.remove(scope, saved.id)
    expect(telegramBotPlatform.mock.calls(saved.id).at(-1)?.method).toBe('deleteWebhook')
  })

  test('credentials are sealed, never returned, kept when omitted and cleared by an empty value', async () => {
    const { service, connections } = makeTestBot()
    const scope = scopeOf()
    const saved = await service.connections.save(scope, { ...telegram, credentials: { token: '42:SECRET' } })
    const record = await connections.get(saved.id)

    expect(saved.credentialsSet).toEqual(['token'])
    expect(JSON.stringify(saved)).not.toContain('42:SECRET')
    expect(JSON.stringify(record)).not.toContain('42:SECRET')

    const renamed = await service.connections.save(scope, { id: saved.id, ...telegram, label: 'Renamed' })
    expect([renamed.label, renamed.credentialsSet, renamed.status]).toEqual(['Renamed', ['token'], BotConnectionStatus.Pending])
    const cleared = await service.connections.save(scope, { id: saved.id, ...telegram, credentials: { token: '' } })
    expect(cleared.credentialsSet).toEqual([])
    expect((await connections.get(saved.id)).sealed).toBeNull()
    await expect(service.connections.save(scope, { ...telegram, credentials: { password: 'x' } }))
      .rejects.toBeInstanceOf(BotCredentialsRejected)
  })

  test('without a secret credentials are refused; a mock connection without credentials still works', async () => {
    const { service } = makeTestBot({ secret: () => undefined })
    const scope = scopeOf()

    await expect(service.connections.save(scope, { ...telegram, credentials: { token: '42:SECRET' } }))
      .rejects.toBeInstanceOf(BotSecretMissing)
    const mock = await service.connections.save(scope, { ...telegram, transport: BotTransport.Mock, credentials: { token: '' } })
    expect((await service.connections.verify(scope, mock.id)).status).toBe(BotConnectionStatus.Connected)
  })

  test('the default secret is APP_SECRET', async () => {
    const previous = process.env.APP_SECRET
    process.env.APP_SECRET = 'from-the-environment'
    try {
      const { service } = makeTestBot({ secret: undefined })
      const saved = await service.connections.save(scopeOf(), { ...telegram, credentials: { token: '1:x' } })
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
    const saved = await service.connections.save(scope, telegram)

    await expect(service.connections.verify(scope, saved.id)).rejects.toBeInstanceOf(BotCredentialsRejected)
    const failed = await service.connections.get(scope, saved.id)
    expect([failed.status, failed.lastError]).toEqual([BotConnectionStatus.Failed, 'bot:credentials-rejected:missing:token'])
  })

  test('connections are scoped: another scope neither lists nor reaches them', async () => {
    const { service } = makeTestBot()
    const [mine, theirs] = [scopeOf(), scopeOf()]
    const saved = await service.connections.save(mine, { ...telegram, transport: BotTransport.Mock })

    expect((await service.connections.list(mine)).map(connection => connection.id)).toEqual([saved.id])
    expect(await service.connections.list(theirs)).toEqual([])
    await expect(service.connections.verify(theirs, saved.id)).rejects.toBeInstanceOf(BotConnectionNotFound)
    await expect(service.connections.remove(theirs, saved.id)).rejects.toBeInstanceOf(BotConnectionNotFound)
    await expect(service.connections.save(theirs, { id: saved.id, ...telegram })).rejects.toBeInstanceOf(BotConnectionNotFound)
  })

  test('a platform the registry has no plugin for is refused; the platform of a connection never changes', async () => {
    // A deployment that registers only some plugins: the contract still lists the others, pending.
    const { service } = makeTestBot({ platforms: [telegramBotPlatform] })
    const scope = scopeOf()

    const pending = service.connections.save(scope, { platform: BotPlatform.WhatsApp, label: 'Shop' })
    await expect(pending).rejects.toBeInstanceOf(BotUnsupportedAction)
    await expect(pending).rejects.toThrow('bot:unsupported-action:platform-not-implemented:whatsapp')
    const saved = await service.connections.save(scope, { ...telegram, transport: BotTransport.Mock })
    await expect(service.connections.save(scope, { id: saved.id, platform: BotPlatform.Discord, label: 'x' }))
      .rejects.toBeInstanceOf(BotUnsupportedAction)
  })

  test('disabling a connection marks it disabled; enabling it again needs a new verification', async () => {
    const { service } = makeTestBot()
    const scope = scopeOf()
    const saved = await service.connections.save(scope, { ...telegram, transport: BotTransport.Mock })
    await service.connections.verify(scope, saved.id)

    const disabled = await service.connections.save(scope, { id: saved.id, ...telegram, enabled: false })
    expect([disabled.enabled, disabled.status]).toEqual([false, BotConnectionStatus.Disabled])
    const enabled = await service.connections.save(scope, { id: saved.id, ...telegram, enabled: true })
    expect(enabled.status).toBe(BotConnectionStatus.Pending)
  })
})
