import type { BotAliases, BotAliasUtils, BotHookAliases } from './aliases/types.js'

export const createBotAliasUtils = (): BotAliasUtils => {
  const botAliases = (base: string): BotAliases => Object.freeze({
    base,
    connection: Object.freeze({
      list: `${base}:connection:list`,
      save: `${base}:connection:save`,
      verify: `${base}:connection:verify`,
      remove: `${base}:connection:remove`,
      simulate: `${base}:connection:simulate`,
    }),
    activity: Object.freeze({ list: `${base}:activity:list` }),
  })

  const botHookAliases = (base: string): BotHookAliases => Object.freeze({
    base,
    receive: `${base}:receive`,
    challenge: `${base}:challenge`,
  })

  return { botAliases, botHookAliases }
}

export const botAliasUtils = createBotAliasUtils()
