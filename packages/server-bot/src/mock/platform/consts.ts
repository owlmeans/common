import { BotActionKind, BotReceiveMode, type BotCredentialField } from '@owlmeans/bot'

/** The test platform's default id. */
export const BOT_TEST_PLATFORM = 'test'

/** The header the test platform signs a delivery with — the connection's hook secret, echoed. */
export const BOT_TEST_SECRET_HEADER = 'x-bot-test-secret'

/** How long one call of the test platform's API may take. */
export const BOT_TEST_CALL_TIMEOUT_MS = 5_000

/** How long the mock's `updates` waits for a fed payload before it answers none (a short long-poll). */
export const BOT_TEST_POLL_WAIT_MS = 20

/** The answers that mean the token itself is refused: a receiver meeting one stops for good. */
export const BOT_TEST_FATAL_CODES: readonly number[] = Object.freeze([401, 404])

/** What the required credentials allow by default — every platform call. */
export const BOT_TEST_ACTIONS: readonly BotActionKind[] = Object.freeze([
  BotActionKind.Reply, BotActionKind.Send, BotActionKind.Delete, BotActionKind.Mute, BotActionKind.Ban,
  BotActionKind.React,
])

/** Webhook when the origin allows it, else polling. */
export const BOT_TEST_RECEIVE: readonly BotReceiveMode[] = Object.freeze([BotReceiveMode.Webhook, BotReceiveMode.Poll])

/** One required secret token. */
export const BOT_TEST_CREDENTIALS: readonly BotCredentialField[] = Object.freeze([
  Object.freeze({
    key: 'token', secret: true, required: true,
    label: Object.freeze({ en: 'Token' }), hint: Object.freeze({ en: 'The token the test platform issued.' }),
  }),
])

/** The chat and the sender a simulated message comes from when the input names none. */
export const BOT_TEST_CHAT = Object.freeze({ id: '1000001', kind: 'group' })
export const BOT_TEST_SENDER = Object.freeze({ id: '2000001', name: 'Member' })

/** The steps an auto-setup test connection lists — the rights a moderating bot needs in its chat. */
export const BOT_TEST_AUTO_STEPS: readonly string[] = Object.freeze([
  'Add the bot to the chat as an administrator allowed to delete messages and restrict members.',
])
