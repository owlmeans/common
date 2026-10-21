import type { MessageContent, MessageFieldWithRole } from '@langchain/core/messages'

/** Reading and copying one message, whatever form the caller built it in. */
export interface MessageUtils {
  /**
   * A copy of the message the model may edit freely: the same class (a langchain message keeps
   * its prototype), a fresh content array. Content blocks themselves are shared — every edit
   * in this package replaces a block rather than writing into it.
   */
  copy: (msg: MessageFieldWithRole) => MessageFieldWithRole
  /** A copy of the message carrying other content. */
  withContent: (msg: MessageFieldWithRole, content: unknown) => MessageFieldWithRole
  /** The provider-neutral role: `system`, `user`, `assistant`, `tool`, or what a plain object names. */
  roleOf: (msg: MessageFieldWithRole) => string
  /** Characters of text a content carries — the measure a cache minimum is checked against. */
  contentLength: (content: MessageContent | undefined) => number
  /** Characters of text in messages `0..index`. */
  charsThrough: (msgs: readonly MessageFieldWithRole[], index: number) => number
}
