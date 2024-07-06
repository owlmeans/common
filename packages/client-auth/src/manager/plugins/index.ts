import { AuthenticationType } from '@owlmeans/auth'
import { ed25519BasicUIPlugin } from './basic-ed25519.js'
import { AuthenticationPlugin } from './types.js'
import type { ClientAuthType } from '../components/index.js'

export const plugins: { [type: ClientAuthType]: AuthenticationPlugin } = {
  [AuthenticationType.BasicEd25519]: ed25519BasicUIPlugin
}
