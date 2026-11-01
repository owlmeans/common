import {
  CAPTCHA_BADGE_CSS, CAPTCHA_EXECUTE_TIMEOUT, CAPTCHA_LOAD_TIMEOUT, CAPTCHA_SCRIPT_ATTRIBUTE, CAPTCHA_STYLE_ATTRIBUTE,
  RECAPTCHA_SCRIPT_URL,
} from './consts.js'
import { CaptchaLoadError } from './errors.js'
import type {
  CaptchaDocument, CaptchaLoadErrorReason, CaptchaLoader, CaptchaLoaderOptions, CaptchaWindow, Grecaptcha,
} from './types.js'

/**
 * Google's reCAPTCHA v3 loader. Nothing touches the page until `prepare` or `token` is called, so
 * the module is safe to import during server rendering and in tests.
 */
export const createCaptchaLoader = (options: CaptchaLoaderOptions = {}): CaptchaLoader => {
  const hideBadge = options.hideBadge ?? true
  const loadTimeout = options.loadTimeout ?? CAPTCHA_LOAD_TIMEOUT
  const executeTimeout = options.executeTimeout ?? CAPTCHA_EXECUTE_TIMEOUT
  const scriptUrl = options.scriptUrl ?? RECAPTCHA_SCRIPT_URL
  const loads = new Map<string, Promise<Grecaptcha>>()

  const documentOf = (): CaptchaDocument | null =>
    options.document ?? (typeof document !== 'undefined' ? document : null)

  const windowOf = (): CaptchaWindow | null =>
    options.window ?? (typeof window !== 'undefined' ? window as unknown as CaptchaWindow : null)

  const addBadgeStyle = (page: CaptchaDocument): void => {
    if (page.querySelector(`style[${CAPTCHA_STYLE_ATTRIBUTE}]`) != null) {
      return
    }
    const style = page.createElement('style')
    style.setAttribute(CAPTCHA_STYLE_ATTRIBUTE, '')
    style.textContent = CAPTCHA_BADGE_CSS
    page.head.appendChild(style)
  }

  const inject = (siteKey: string): Promise<Grecaptcha> => new Promise<Grecaptcha>((resolve, reject) => {
    const page = documentOf()
    const host = windowOf()
    if (page == null || host == null) {
      reject(new CaptchaLoadError('unavailable', 'reCAPTCHA needs a page to load into'))
      return
    }

    const script = page.createElement('script')
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const fail = (reason: CaptchaLoadErrorReason, message: string): void => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        script.remove()
        reject(new CaptchaLoadError(reason, message))
      }
    }
    timer = setTimeout(() => { fail('timeout', 'reCAPTCHA did not become ready in time') }, loadTimeout)

    script.addEventListener('error', () => { fail('load', 'reCAPTCHA failed to load') })
    script.addEventListener('load', () => {
      const grecaptcha = host.grecaptcha
      if (grecaptcha == null || typeof grecaptcha.ready !== 'function') {
        fail('unavailable', 'reCAPTCHA loaded without its API')
        return
      }
      grecaptcha.ready(() => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(host.grecaptcha ?? grecaptcha)
        }
      })
    })

    script.src = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}render=${encodeURIComponent(siteKey)}`
    script.async = true
    script.setAttribute(CAPTCHA_SCRIPT_ATTRIBUTE, siteKey)
    if (hideBadge) {
      addBadgeStyle(page)
    }
    page.head.appendChild(script)
  })

  const readyOf = (siteKey: string): Promise<Grecaptcha> => {
    const known = loads.get(siteKey)
    if (known != null) {
      return known
    }
    const loading = inject(siteKey)
    loads.set(siteKey, loading)
    loading.catch(() => { loads.delete(siteKey) })

    return loading
  }

  const prepare: CaptchaLoader['prepare'] = async siteKey => {
    await readyOf(siteKey)
  }

  const token: CaptchaLoader['token'] = async (siteKey, action) => {
    const grecaptcha = await readyOf(siteKey)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const value = await Promise.race([
        Promise.resolve(grecaptcha.execute(siteKey, { action })),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { reject(new Error('reCAPTCHA execute timed out')) }, executeTimeout)
        }),
      ])
      if (typeof value !== 'string' || value === '') {
        throw new Error('reCAPTCHA gave no token')
      }
      return value
    } catch (error) {
      throw new CaptchaLoadError('execute', `reCAPTCHA refused: ${String(error)}`, { cause: error })
    } finally {
      clearTimeout(timer)
    }
  }

  return { prepare, token }
}

/** The shared loader of a page: one script per site key across every caller. */
export const captchaLoader = createCaptchaLoader()
