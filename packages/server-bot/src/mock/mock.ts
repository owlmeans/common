import { BotConnectionStatus, BotTransport, type BotPlatformId, type BotSimulateInput } from '@owlmeans/bot'
import { makeBotPlatformRegistry } from '../platforms/registry.js'
import type { BotNativeInbound, BotPlatformConnection, BotPlatformPlugin } from '../platforms/types.js'
import type { BotMockHelper, BotMockSigning } from './types.js'

/**
 * The mock helper over the plugins a test names — the very instances its service is given, so a
 * test feeds what that service reads (a plugin's mock state lives in the instance).
 */
export const makeBotMockHelper = (plugins: readonly BotPlatformPlugin[]): BotMockHelper => {
  const registry = makeBotPlatformRegistry(plugins)

  const connectionOf = (platform: BotPlatformId, signing: BotMockSigning): BotPlatformConnection => {
    const stamp = new Date().toISOString()
    const descriptor = registry.require(platform).descriptor
    const credentials = { ...(signing.credentials ?? {}) }
    const hookSecret = signing.hookSecret ?? ''
    for (const field of descriptor.credentials) {
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
      receive: descriptor.receive[0],
      ...(signing.identity != null ? { identity: { ...signing.identity } } : {}),
      credentialsSet: Object.keys(credentials),
      createdAt: stamp,
      updatedAt: stamp,
      credentials,
      hookSecret,
    }
  }

  const inbound = (platform: BotPlatformId, input: BotSimulateInput, signing: BotMockSigning): BotNativeInbound =>
    registry.require(platform).mock.inbound(input, connectionOf(platform, signing))

  const feed = (platform: BotPlatformId, signing: BotMockSigning, input: BotSimulateInput): void => {
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
