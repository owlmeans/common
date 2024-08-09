
import type { JSONSchemaType} from 'ajv'
import type {PinForm} from './types.js'

export const PinSchema: JSONSchemaType<PinForm> = {
  type: 'object',
  properties: {
    pin: { type: 'string', minLength: 2, maxLength: 12 }
  },
  required: ['pin']
}
