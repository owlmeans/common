import { PLUGIN_RECORD } from '@owlmeans/config'
import type { PluginConfig } from '@owlmeans/config'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { ensureCaptchaService } from '../src/service.js'
import type { CaptchaProvider, CaptchaVerdict, CaptchaVerifyOptions } from '../src/types.js'

/** One question a stand-in provider was asked. */
export interface Asked extends CaptchaVerifyOptions {
  token: string
}

export interface TestProviderOptions {
  id?: string
  /** What every `verify` answers. */
  verdict?: CaptchaVerdict
  /** Thrown by every `verify` instead of answering. */
  failure?: Error
  siteKey?: string
}

export interface TestProvider extends CaptchaProvider {
  /** Every question `verify` was asked, in order. */
  asked: Asked[]
}

/** A provider that answers what it is told — no network, nothing provider-specific. */
export const makeTestProvider = ({ id = 'test', verdict, failure, siteKey = 'site-key' }: TestProviderOptions = {}): TestProvider => {
  const asked: Asked[] = []

  return {
    id,
    asked,
    verify: async (token, options) => {
      asked.push({ token, ...options })
      if (failure != null) {
        throw failure
      }
      return verdict ?? { success: false }
    },
    clientSettings: () => ({ provider: id, siteKey }),
  }
}

export interface TestCtxOptions {
  /** Providers registered in the context's captcha host before it initializes. */
  providers?: CaptchaProvider[]
  /** Plugin records of the config (e.g. a `MOD_CAPTCHA` host record). */
  plugins?: PluginConfig[]
}

/** A backend context with the given providers in its captcha host and the given plugin records. */
export const makeTestCtx = async ({ providers = [], plugins = [] }: TestCtxOptions = {}): Promise<BasicContext<BasicConfig>> => {
  const context = makeBasicContext<BasicConfig>({
    ready: false, service: 'captcha-tests', type: AppType.Backend, services: {},
    [PLUGIN_RECORD]: plugins.map(record => ({ ...record })),
  } as BasicConfig)
  for (const provider of providers) {
    ensureCaptchaService(context).register(provider)
  }
  context.configure()
  await context.init()

  return context
}
