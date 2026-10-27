import { BOT_COMMAND_PATTERN } from '../consts.local.js'
import type { BotCommand } from '../types.js'
import type { BotCommandHelper } from './command/types.js'

export const createBotCommandHelper = (): BotCommandHelper => {
  const parse = (text: string, botUsername?: string): BotCommand | null => {
    if (typeof text !== 'string') {
      return null
    }
    const found = BOT_COMMAND_PATTERN.exec(text.trimStart())
    if (found == null) {
      return null
    }
    const [, name, addressee, args] = found
    const own = botUsername?.replace(/^@/, '').trim().toLowerCase()
    if (addressee != null && own != null && own !== '' && addressee.toLowerCase() !== own) {
      return null
    }

    return { name: name.toLowerCase(), args: (args ?? '').trim() }
  }

  return { parse }
}

export const botCommandHelper = createBotCommandHelper()
