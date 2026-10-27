import { BOT_PLATFORMS, type BotActionKind, type BotPlatform } from '@owlmeans/bot'
import { messageOf } from './message.js'
import {
  REFUSAL_ACTION_VERBS, REFUSAL_CODE_SEGMENT, REFUSAL_INVALID_ACTIONS, REFUSAL_MARKER, REFUSAL_TIMEOUT,
  REFUSAL_UNREACHABLE,
} from './refusal/consts.js'
import type { BotRefusal, RefusalUtils } from './refusal/types.js'

/** The sentence of a failed action — what `BotActionResult.error` and the activity's `error` say. */
export const createRefusalUtils = (): RefusalUtils => {
  /** A sentence ends with its stop. */
  const sentence = (text: string): string => /[.!?…]$/.test(text) ? text : `${text}.`

  /** What the platform itself said: the detail without its leading codes and Web API method. */
  const wordsOf = (detail: string): string => {
    const parts = detail.split(':')
    let at = 0
    while (at < parts.length - 1 && REFUSAL_CODE_SEGMENT.test(parts[at].trim())) {
      at++
    }

    return parts.slice(at).join(':').trim()
  }

  const of: RefusalUtils['of'] = (failure: unknown, kind: BotActionKind, platform?: BotPlatform): BotRefusal => {
    const code = typeof failure === 'string' ? failure : messageOf(failure)
    const title = (platform != null ? BOT_PLATFORMS[platform]?.title : undefined) ?? 'The platform'
    const verb = (action: string): string => REFUSAL_ACTION_VERBS[action as BotActionKind] ?? REFUSAL_ACTION_VERBS[kind]
    const marked = REFUSAL_MARKER.exec(code.trim())
    if (marked == null) {
      // Not a bot refusal (a fault of the plugin's own code): its message is all there is.
      return { error: sentence(`The action failed: ${code.trim() === '' ? 'no reason given' : code.trim()}`), code }
    }
    const [, marker, detail = ''] = marked
    const answer = (text: string): BotRefusal => ({ error: sentence(text), code })

    switch (marker) {
      case 'connection-not-found':
        return answer('The bot connection does not exist')
      case 'connection-disabled':
        return answer('The bot connection is switched off')
      case 'unsupported-action': {
        // An action an optional credential adds (Slack's `userToken` → delete) names that credential.
        const action = (REFUSAL_ACTION_VERBS[detail as BotActionKind] != null ? detail : kind) as BotActionKind
        const enabler = platform != null
          ? BOT_PLATFORMS[platform]?.credentials.find(field => field.enables?.includes(action) === true)
          : undefined
        return answer(enabler != null
          ? `${title} can ${verb(action)} only with the ${enabler.key} credential`
          : `${title} cannot ${verb(action)}`)
      }
      case 'credentials-rejected':
        return answer(`${title} refused the bot's credentials`)
      case 'credentials-unreadable':
        return answer('The bot\'s credentials cannot be opened on this server')
      case 'secret-missing':
        return answer('The server has no secret to open the bot\'s credentials')
      case 'invalid-action': {
        const [what, action] = detail.split(':')
        if (what === 'no-guild') {
          return answer(`${title} can ${verb(action)} only in a server, and this chat is in none`)
        }
        return answer(REFUSAL_INVALID_ACTIONS[what] ?? 'The action is not valid')
      }
    }
    // A platform's API error (`bot:telegram:…`, `bot:slack:…`) — or another refusal: its own words.
    const words = wordsOf(detail)
    if (REFUSAL_UNREACHABLE.test(words)) {
      return answer(`${title} could not be reached`)
    }
    if (REFUSAL_TIMEOUT.test(words)) {
      return answer(`${title} did not answer in time`)
    }

    return answer(words === '' || words === 'error' ? `${title} refused the action` : `${title} refused: ${words}`)
  }

  return { of }
}

export const refusalUtils = createRefusalUtils()
