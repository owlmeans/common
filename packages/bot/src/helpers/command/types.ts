import type { BotCommand } from '../../types.js'

export interface BotCommandHelper {
  /**
   * Read a `/command` off the start of a message: `/report@MyBot some args` →
   * `{ name: 'report', args: 'some args' }`.
   *
   * The name is lower-cased and must end at whitespace or at the end of the text (`/usr/bin` is not a
   * command); `args` is the trimmed rest, `''` when none. A command addressed to ANOTHER bot
   * (`@OtherBot`, compared case-insensitively, a leading `@` of `botUsername` ignored) answers `null`
   * — when `botUsername` is not given, any address is accepted. Not a command answers `null`.
   */
  parse: (text: string, botUsername?: string) => BotCommand | null
}
