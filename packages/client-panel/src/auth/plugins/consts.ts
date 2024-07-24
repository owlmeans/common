import { JSONSchemaType } from 'ajv'
import { Ed22519BasicAuthUIPluginForm } from './types.js'

// @TODO Move to some abstract layer cause this validation is the same for both client
// and server
export const Ed22519BasicAuthUIPluginFormSchema: JSONSchemaType<Ed22519BasicAuthUIPluginForm> = {
  type: 'object',
  properties: {
    entityId: { type: 'string', minLength: 1, maxLength: 255, default: '' },
    address: { type: 'string', minLength: 1, maxLength: 255, default: '' },
    privateKey: { type: 'string', minLength: 1, maxLength: 512, default: '' }
  },
  required: ['entityId', 'address', 'privateKey']
}
