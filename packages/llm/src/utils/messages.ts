import { BaseMessage, type MessageContent, type MessageFieldWithRole } from '@langchain/core/messages'
import { ROLE_ALIASES } from './messages/consts.js'
import type { MessageUtils } from './messages/types.js'

export const createMessageUtils = (): MessageUtils => {
  const withContent = (msg: MessageFieldWithRole, content: unknown): MessageFieldWithRole => {
    if (msg instanceof BaseMessage) {
      const copy = Object.assign(Object.create(Object.getPrototypeOf(msg) as object) as BaseMessage, msg)
      copy.content = content as MessageContent
      return copy as unknown as MessageFieldWithRole
    }

    return { ...msg, content } as MessageFieldWithRole
  }

  const copy = (msg: MessageFieldWithRole): MessageFieldWithRole =>
    withContent(msg, Array.isArray(msg.content) ? [...msg.content] : msg.content)

  const roleOf = (msg: MessageFieldWithRole): string => {
    const role = msg instanceof BaseMessage ? msg.getType() : `${msg.role}`
    return ROLE_ALIASES[role] ?? role
  }

  const contentLength = (content: MessageContent | undefined): number => {
    if (typeof content === 'string') {
      return content.length
    }
    if (Array.isArray(content)) {
      return content.reduce<number>((sum, part) => {
        const text = (part as unknown as { text?: unknown }).text
        return sum + (typeof text === 'string' ? text.length : 0)
      }, 0)
    }
    return 0
  }

  const charsThrough = (msgs: readonly MessageFieldWithRole[], index: number): number =>
    msgs.slice(0, index + 1).reduce((sum, msg) => sum + contentLength(msg.content), 0)

  return { copy, withContent, roleOf, contentLength, charsThrough }
}

export const messageUtils = createMessageUtils()
