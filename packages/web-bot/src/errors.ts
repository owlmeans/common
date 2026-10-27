import { BotError } from '@owlmeans/bot'
import { ResilientError } from '@owlmeans/error'
import type { ResilientErrorConstructor } from '@owlmeans/error'
import { BOT_ERROR_TYPES } from './helpers/error/consts.local.js'

/**
 * A browser-side stand-in for one of `@owlmeans/server-bot`'s refusal classes, by its `typeName`
 * alone. This package never loads server-bot, and an unregistered type reaches the API client as an
 * unrecognized error; registered under the same name, a refusal that crossed the wire is rebuilt as
 * a `BotError` that keeps its type and its `bot:<marker>:<detail>` message — what the panels explain.
 */
const mirrorOf = (typeName: string): ResilientErrorConstructor => class extends BotError {
  public static override typeName: string = typeName

  constructor(message: string = 'error') {
    super(message)
    this.type = typeName
  }
}

for (const typeName of Object.keys(BOT_ERROR_TYPES)) {
  ResilientError.registerErrorClass(mirrorOf(typeName))
}
