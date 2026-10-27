import type { JSONSchema } from '@langchain/core/utils/json_schema'

/**
 * The tools' argument schemas — plain JSON Schema, as every tool of `@owlmeans/agent` declares them,
 * so no schema library ships with the package. Bounds are NOT declared (some providers refuse them in
 * a tool schema): the server-bot actions validate the values and answer what was wrong.
 */
export const BotAgentNoArgsSchema: JSONSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

export const BotAgentTextSchema: JSONSchema = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'The text to post — plain words, in the language of the chat.' },
  },
  required: ['text'],
  additionalProperties: false,
}

export const BotAgentWarnSchema: JSONSchema = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'The warning — short, polite, naming the rule the message broke.' },
  },
  required: ['text'],
  additionalProperties: false,
}

export const BotAgentMuteSchema: JSONSchema = {
  type: 'object',
  properties: {
    minutes: { type: 'integer', description: 'How long, in whole minutes — at least 1 (60 is an hour, 1440 a day).' },
  },
  required: ['minutes'],
  additionalProperties: false,
}

export const BotAgentReactSchema: JSONSchema = {
  type: 'object',
  properties: {
    emoji: { type: 'string', description: 'ONE emoji, such as 👍 or 👎.' },
  },
  required: ['emoji'],
  additionalProperties: false,
}
