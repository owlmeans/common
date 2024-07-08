import { AuthenticationType } from '@owlmeans/auth'
import type { AuthPlugin } from './types.js'
import { basicEd25519 } from './basic-ed25519.js'
import type { AppContext, AppConfig } from '../types.js'

export const plugins: Record<string, (context: AppContext<AppConfig>) => AuthPlugin> = {}

plugins[AuthenticationType.BasicEd25519] = basicEd25519
