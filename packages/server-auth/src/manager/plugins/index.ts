import { AuthenticationType } from '@owlmeans/auth'
import type { AuthPluginFactory } from './types.js'
import { makeBasicEd25519Plugin } from './basic-ed25519.js'
import { makeReCaptchaPlugin } from './re-captcha.js'
import { makeBasicRelyPlugin } from './basic-rely.js'

export const plugins: Record<string, AuthPluginFactory> = {}

plugins[AuthenticationType.BasicEd25519] = makeBasicEd25519Plugin as AuthPluginFactory
plugins[AuthenticationType.ReCaptcha] = makeReCaptchaPlugin as AuthPluginFactory
plugins[AuthenticationType.RelyHandshake] = makeBasicRelyPlugin as AuthPluginFactory

/** Register an external AuthPlugin factory under a custom type string. */
export const registerPlugin = (
  type: string,
  factory: AuthPluginFactory
): void => {
  plugins[type] = factory
}
