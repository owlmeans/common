import { BotActionKind } from '../consts.js'
import type { BotPlatformDescriptor } from '../types.js'
import type { BotPlatformHelper } from './platform/types.js'

export const createBotPlatformHelper = (): BotPlatformHelper => {
  const actionsOf = (
    descriptor: BotPlatformDescriptor | null | undefined, credentialsSet: readonly string[] = []
  ): BotActionKind[] => {
    if (descriptor == null) {
      return [BotActionKind.Note]
    }
    const enabled = descriptor.credentials
      .filter(field => field.enables != null && credentialsSet.includes(field.key))
      .flatMap(field => field.enables ?? [])

    return [...new Set([...descriptor.actions, ...enabled, BotActionKind.Note])]
  }

  const supports = (
    descriptor: BotPlatformDescriptor | null | undefined, kind: BotActionKind, credentialsSet?: readonly string[]
  ): boolean => actionsOf(descriptor, credentialsSet).includes(kind)

  return { actionsOf, supports }
}

export const botPlatformHelper = createBotPlatformHelper()
