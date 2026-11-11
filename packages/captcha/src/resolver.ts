import { PLUGIN_RECORD, PluginMissconfigured } from '@owlmeans/config'
import type { PluginConfig } from '@owlmeans/config'
import { memoHelper } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { logger } from '@owlmeans/log'
import { CAPTCHA_SERVICE, MOD_CAPTCHA } from './consts.js'
import type { CaptchaPolicyRecord, CaptchaResolver, CaptchaService } from './types.js'

const log = logger('captcha')

export const makeCaptchaResolver = <C extends BasicConfig, T extends BasicContext<C>>(context: T): CaptchaResolver => {
  const reported = new Set<string>()

  const host = (): CaptchaService | null =>
    context.hasService(CAPTCHA_SERVICE) ? context.service<CaptchaService>(CAPTCHA_SERVICE) : null

  const find: CaptchaResolver['find'] = id => host()?.get(id) ?? null

  const provider: CaptchaResolver['provider'] = id => {
    const found = find(id)
    if (found != null) {
      return found
    }
    const name = id != null && id !== '' ? id : 'any'
    if (!reported.has(name)) {
      reported.add(name)
      const registered = host()?.list().map(entry => entry.id) ?? []
      log.error('Captcha is configured, but no registered captcha provider fits: register the provider package\'s'
        + ' append helper on this context, or remove the captcha settings', { provider: name, registered },
      { event: 'auth.captcha.provider' })
    }

    throw new PluginMissconfigured(`captcha:provider:${name}`)
  }

  const record: CaptchaResolver['record'] = () => {
    const records = (context.cfg as { [PLUGIN_RECORD]?: PluginConfig[] })[PLUGIN_RECORD]

    return records?.find(entry => entry.id === MOD_CAPTCHA) as CaptchaPolicyRecord | undefined ?? null
  }

  const assertReady: CaptchaResolver['assertReady'] = () => {
    const declared = record()
    if (declared != null) {
      provider(declared.provider)
    }
  }

  return { find, provider, record, assertReady }
}

/** The captcha resolver of a context — built once per context. */
export const captchaResolverOf = memoHelper.oncePer(makeCaptchaResolver)
