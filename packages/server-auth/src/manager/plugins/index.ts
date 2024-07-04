import { AuthenticationType } from '@owlmeans/auth'
import type { AuthPlugin } from './types.js'
import { basicEd25519 } from './basic-ed25519.js'
import type { Context } from '@owlmeans/server-context'

export const plugins: Record<string, (context: Context) => AuthPlugin> = {}

plugins[AuthenticationType.BasicEd25519] = basicEd25519
