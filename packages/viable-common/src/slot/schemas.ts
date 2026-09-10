import type { JSONSchemaType } from 'ajv'
import { SlotCommandType, SlotFileCommand, SlotGitCommand, SlotShellCommand } from './consts.js'
import type { SlotCommandPayload } from './types.js'

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
