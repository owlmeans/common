import { BOT_PLATFORMS, BotActionKind, type BotPlatform } from '../consts.js'
import type { BotPlatformHelper } from './platform/types.js'

export const createBotPlatformHelper = (): BotPlatformHelper => {
  const actionsOf = (platform: BotPlatform, credentialsSet: readonly string[] = []): BotActionKind[] => {
    const descriptor = BOT_PLATFORMS[platform]
    if (descriptor == null) {
      return [BotActionKind.Note]
    }
    const enabled = descriptor.credentials
      .filter(field => field.enables != null && credentialsSet.includes(field.key))
      .flatMap(field => field.enables ?? [])

    return [...new Set([...descriptor.actions, ...enabled, BotActionKind.Note])]
  }

  const supports = (platform: BotPlatform, kind: BotActionKind, credentialsSet?: readonly string[]): boolean =>
    actionsOf(platform, credentialsSet).includes(kind)

  return { actionsOf, supports }
}

export const botPlatformHelper = createBotPlatformHelper()
