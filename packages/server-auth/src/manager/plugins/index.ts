import { AuthenticationType } from '@owlmeans/auth'
import type { AuthPlugin } from './types.js'
import { basicEd25519 } from './basic-ed25519.js'
import type { AppContext, AppConfig } from '../types.js'
import { reCaptcha } from './re-captcha.js'
import { basicRely } from './basic-rely.js'

export const plugins: Record<string, (context: AppContext<AppConfig>) => AuthPlugin> = {}

plugins[AuthenticationType.BasicEd25519] = basicEd25519
plugins[AuthenticationType.ReCaptcha] = reCaptcha
plugins[AuthenticationType.RelyHandshake] = basicRely
