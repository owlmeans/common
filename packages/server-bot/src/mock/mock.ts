import {
  BOT_PLATFORMS, BotConnectionStatus, BotTransport, type BotPlatform, type BotSimulateInput,
} from '@owlmeans/bot'
import { BOT_BUILTIN_PLATFORMS } from '../platforms/consts.js'
import { makeBotPlatformRegistry } from '../platforms/registry.js'
import type { BotNativeInbound, BotPlatformConnection, BotPlatformPlugin } from '../platforms/types.js'
import type { BotMockHelper, BotMockSigning } from './types.js'

/** The mock helper over a set of plugins — the built-in instances by default, so a test feeds what a service reads. */
export const makeBotMockHelper = (plugins: readonly BotPlatformPlugin[] = BOT_BUILTIN_PLATFORMS): BotMockHelper => {
  const registry = makeBotPlatformRegistry(plugins)

  const connectionOf = (platform: BotPlatform, signing: BotMockSigning): BotPlatformConnection => {
    const stamp = new Date().toISOString()
    const credentials = { ...(signing.credentials ?? {}) }
    const hookSecret = signing.hookSecret ?? ''
    for (const field of BOT_PLATFORMS[platform]?.credentials ?? []) {
      if (field.generated === true && (credentials[field.key] ?? '') === '' && hookSecret !== '') {
        credentials[field.key] = hookSecret
      }
    }

    return {
      id: signing.id ?? 'mock',
      scope: 'mock',
      platform,
      label: signing.label ?? '',
      transport: BotTransport.Mock,
      status: BotConnectionStatus.Connected,
      enabled: true,
      receive: BOT_PLATFORMS[platform]?.receive[0],
      ...(signing.identity != null ? { identity: { ...signing.identity } } : {}),
      credentialsSet: Object.keys(credentials),
      createdAt: stamp,
      updatedAt: stamp,
      credentials,
      hookSecret,
    }
  }

  const inbound = (platform: BotPlatform, input: BotSimulateInput, signing: BotMockSigning): BotNativeInbound =>
    registry.require(platform).mock.inbound(input, connectionOf(platform, signing))

  const feed = (platform: BotPlatform, signing: BotMockSigning, input: BotSimulateInput): void => {
    const connection = connectionOf(platform, signing)
    const plugin = registry.require(platform)
    plugin.mock.feed(connection.id, plugin.mock.inbound(input, connection).body)
  }

  return {
    inbound,
    feed,
    calls: (platform, connection) => registry.require(platform).mock.calls(connection),
    plugin: registry.require,
  }
}

export const botMockHelper = makeBotMockHelper()
