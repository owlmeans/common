import type { ClientAuthType } from '../components/index.js'

import { AuthenticationType } from '@owlmeans/auth'
import { ed25519BasicUIPlugin } from './basic-ed25519.js'
import { AuthenticationPlugin } from './types.js'
import { reCaptchaPlugin } from './re-captcha.js'

export const plugins: { [type: ClientAuthType]: AuthenticationPlugin } = {}

plugins[AuthenticationType.BasicEd25519] = ed25519BasicUIPlugin
plugins[AuthenticationType.ReCaptcha] = reCaptchaPlugin
