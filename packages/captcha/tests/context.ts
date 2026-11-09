import { AppType, createService, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { CAPTCHA_VERIFIER } from '../src/consts.js'
import type { CaptchaFetch, CaptchaRequest, CaptchaResponse, CaptchaVerifierService } from '../src/types.js'
import { appendCaptchaVerifierService } from '../src/verifier.js'

export interface TestCtx {
  context: BasicContext<BasicConfig>
  /** Every request the stand-in verifier was asked. */
  asked: CaptchaRequest[]
}

export interface TestCtxOptions {
  /** A stand-in verifier under `CAPTCHA_VERIFIER` answering this — no network. */
  answer?: CaptchaResponse
  /** The default verifier appended under `CAPTCHA_VERIFIER`, its `fetch` replaced by this. */
  fetch?: CaptchaFetch
}

/**
 * A backend context; given `answer`, it registers a stand-in verifier under `CAPTCHA_VERIFIER` that
 * records each request and answers `answer`; given `fetch`, it appends the default verifier over it.
 */
export const makeTestCtx = async ({ answer, fetch }: TestCtxOptions = {}): Promise<TestCtx> => {
  const context = makeBasicContext<BasicConfig>({
    ready: false, service: 'captcha-tests', type: AppType.Backend, services: {},
  })
  const asked: CaptchaRequest[] = []
  if (fetch != null) {
    appendCaptchaVerifierService(context, CAPTCHA_VERIFIER, { fetch })
  } else if (answer != null) {
    context.registerService(createService<CaptchaVerifierService>(CAPTCHA_VERIFIER, {
      verify: async request => { asked.push(request); return answer },
    }))
  }
  context.configure()
  await context.init()

  return { context, asked }
}
