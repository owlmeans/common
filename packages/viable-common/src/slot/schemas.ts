import type { JSONSchemaType } from 'ajv'
import { SlotCommandType, SlotFileCommand, SlotGitCommand, SlotShellCommand } from './consts.js'
import type { SlotCommandPayload, SlotGitCloneArgs } from './types.js'

export const SlotCommandPayloadSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: Object.values(SlotCommandType)
    },
    command: {
      oneOf: [
        { type: 'string', enum: Object.values(SlotFileCommand) },
        { type: 'string', enum: Object.values(SlotShellCommand) },
        { type: 'string', enum: Object.values(SlotGitCommand) },
      ]
    },
    args: {
      type: 'object',
      nullable: true,
      additionalProperties: true
    }
  },
  required: ['type', 'command'],
  additionalProperties: false
} as JSONSchemaType<SlotCommandPayload>

/**
 * The clone command's arguments, as a signed body carries them.
 *
 * `token` is declared because it is SENT — a body field the schema does not declare is stripped
 * by validation and then verified against a signature the sender made over the whole thing, which
 * the guard reports as a 401 rather than as the validation gap it is.
 */
export const SlotGitCloneArgsSchema = {
  type: 'object',
  properties: {
    remoteUrl: { type: 'string', minLength: 1, maxLength: 2048 },
    branch: { type: 'string', maxLength: 256, nullable: true },
    depth: { type: 'number', minimum: 0, nullable: true },
    token: { type: 'string', maxLength: 4096, nullable: true },
  },
  required: ['remoteUrl'],
  additionalProperties: false,
} as unknown as JSONSchemaType<SlotGitCloneArgs>
