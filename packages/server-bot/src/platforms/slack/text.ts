import type { SlackTextHelper } from './types.js'

/**
 * Slack escapes `&`, `<` and `>` in message text (https://docs.slack.dev/messaging/formatting-message-text/):
 * an inbound text is decoded so rules match what people read; an outbound text is encoded so the
 * contract's plain text stays literal (no accidental links or mentions).
 */
export const createSlackTextHelper = (): SlackTextHelper => {
  const decode = (text: string): string => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

  const encode = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return { decode, encode }
}

export const slackTextHelper = createSlackTextHelper()
