import { AuthenticationType } from '@owlmeans/auth'
import type { AuthPlugin } from './types.js'
import { basicEd25519 } from './basic-ed25519.js'
import type { AppContext, AppConfig } from '../types.js'
import { reCaptcha } from './re-captcha.js'
import { basicRely } from './basic-rely.js'

export const plugins: Record<string, <C extends AppConfig, T extends AppContext<C>>(context: T) => AuthPlugin> = {}

plugins[AuthenticationType.BasicEd25519] = basicEd25519 as typeof plugins[keyof typeof plugins]
plugins[AuthenticationType.ReCaptcha] = reCaptcha as typeof plugins[keyof typeof plugins]
plugins[AuthenticationType.RelyHandshake] = basicRely as typeof plugins[keyof typeof plugins]

