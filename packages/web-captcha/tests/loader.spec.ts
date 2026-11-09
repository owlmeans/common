import { describe, expect, test } from 'bun:test'
import {
  CAPTCHA_BADGE_CSS, CAPTCHA_SCRIPT_ATTRIBUTE, CAPTCHA_STYLE_ATTRIBUTE, RECAPTCHA_SCRIPT_URL,
} from '../src/consts.js'
import { CaptchaLoadError } from '../src/errors.js'
import { captchaLoader, createCaptchaLoader } from '../src/loader.js'
import type { CaptchaLoaderOptions } from '../src/types.js'
import { makeTestPage } from './context.js'

const loaderOn = (page = makeTestPage(), options: CaptchaLoaderOptions = {}) =>
  ({ page, loader: createCaptchaLoader({ document: page.document, window: page.window, ...options }) })

const failure = async (promise: Promise<unknown>): Promise<CaptchaLoadError> => {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(CaptchaLoadError)
    return error as CaptchaLoadError
  }
  throw new Error('expected a failure')
}

describe('@owlmeans/web-captcha — loader', () => {
  test('injects one script per site key, with the badge style once, and resolves when grecaptcha is ready', async () => {
    const { page, loader } = loaderOn()

    const first = loader.prepare('key one')
    const again = loader.prepare('key one')
    expect(page.scripts()).toHaveLength(1)
    const [script] = page.scripts()
    expect(script.src).toBe(`${RECAPTCHA_SCRIPT_URL}?render=key%20one`)
    expect(script.async).toBe(true)
    expect(script.attributes[CAPTCHA_SCRIPT_ATTRIBUTE]).toBe('key one')

    page.arrive(script)
    await Promise.all([first, again])
    await loader.prepare('key one')
    expect(page.scripts()).toHaveLength(1)

    const second = loader.prepare('key-two')
    page.arrive(page.scripts()[1])
    await second
    expect(page.scripts()).toHaveLength(2)
    const styles = page.head.filter(element => element.tag === 'style')
    expect(styles).toHaveLength(1)
    expect(styles[0].attributes).toHaveProperty(CAPTCHA_STYLE_ATTRIBUTE)
    expect(styles[0].textContent).toBe(CAPTCHA_BADGE_CSS)
  })

  test('a load that fails or never becomes ready is refused with its reason, and forgotten', async () => {
    const { page, loader } = loaderOn(makeTestPage(), { loadTimeout: 5 })

    const timedOut = await failure(loader.prepare('k'))
    expect(timedOut.reason).toBe('timeout')
    expect(page.scripts()).toHaveLength(0)

    const erroring = loader.prepare('k')
    page.scripts()[0].fire('error')
    expect((await failure(erroring)).reason).toBe('load')

    const bare = loader.prepare('k')
    page.arrive(page.scripts()[0], null)
    expect((await failure(bare)).reason).toBe('unavailable')

    const retried = loader.prepare('k')
    page.arrive(page.scripts()[0])
    await retried
    expect(page.head.filter(element => element.tag === 'script')).toHaveLength(4)
    expect(page.scripts()).toHaveLength(1)
  })

  test('without a page nothing is touched at import, and a call is unavailable', async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined')
    expect((await failure(captchaLoader.prepare('k'))).reason).toBe('unavailable')
    expect((await failure(createCaptchaLoader().token('k', 'a'))).reason).toBe('unavailable')
  })

  test('hideBadge: false adds no document style; a script url with a query keeps it', async () => {
    const { page, loader } = loaderOn(makeTestPage(), { hideBadge: false, scriptUrl: 'https://www.recaptcha.net/recaptcha/api.js?hl=pl' })

    const ready = loader.prepare('k')
    page.arrive(page.scripts()[0])
    await ready
    expect(page.head.map(element => element.tag)).toEqual(['script'])
    expect(page.scripts()[0].src).toBe('https://www.recaptcha.net/recaptcha/api.js?hl=pl&render=k')
  })
})

describe('@owlmeans/web-captcha — token', () => {
  test('loads on demand and executes the action', async () => {
    const { page, loader } = loaderOn()

    const token = loader.token('k', 'email_pin')
    page.arrive(page.scripts()[0])
    expect(await token).toBe('token:k:email_pin')
    expect(await loader.token('k', 'email_password')).toBe('token:k:email_password')
    expect(page.scripts()).toHaveLength(1)
  })

  test('no token, a throwing or a hanging execute is an execute failure', async () => {
    for (const execute of [
      async () => '',
      () => { throw new Error('denied') },
      () => new Promise<string>(() => {}),
    ]) {
      const { page, loader } = loaderOn(makeTestPage(), { executeTimeout: 5 })
      const token = loader.token('k', 'email_pin')
      page.arrive(page.scripts()[0], { ready: callback => { callback() }, execute })
      expect((await failure(token)).reason).toBe('execute')
    }
  })
})
