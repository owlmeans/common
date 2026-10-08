import { INQUIRY_OPEN_EVENT, type InquiryOpenEvent, type InquiryRuntime } from '@owlmeans/common-inquiry'
import { logger } from '@owlmeans/log'
import { INQUIRY_LOAD_TIMEOUT } from './consts.js'
import { LOG_SCOPE, NO_DESTINATION } from './consts.local.js'
import type { InquiryClient, InquiryClientOptions } from './types.js'
import { inquiryLoaderUtils } from './utils/loader.js'

/**
 * A host page's inquiry client. Building it costs nothing: the widget runtime is fetched on the
 * first `load`, `open`, `button` or bound click.
 *
 * ```ts
 * const inquiry = makeInquiryClient({ url: 'https://platform.owlmeans.com/crm', language: () => i18n.language })
 * inquiry.bind('[data-inquiry="quote"]', quoteConfig, { source: 'pricing-card' })
 * ```
 */
export const makeInquiryClient = (options: InquiryClientOptions): InquiryClient => {
  const url = options.url.replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? INQUIRY_LOAD_TIMEOUT
  const eventName = options.analytics === false ? null : options.analytics ?? INQUIRY_OPEN_EVENT
  const log = logger(LOG_SCOPE)

  /** The one place an open is reported — the runtime calls it once per open, whatever opened it. */
  const opened = (event: InquiryOpenEvent): void => {
    if (eventName != null) {
      log.info('Inquiry dialog opened', {
        inquiry_widget: event.widget,
        inquiry_tab: event.tab,
        inquiry_source: event.source,
      }, { analytics: eventName, console: false })
    }
    options.onOpen?.(event)
  }

  const load: InquiryClient['load'] = async (): Promise<InquiryRuntime> => {
    const runtime = await inquiryLoaderUtils.load(url, timeoutMs)
    runtime.configure({ url, language: options.language, onOpen: inquiryLoaderUtils.dispatcher(url) })

    return runtime
  }

  const open: InquiryClient['open'] = async (config, opts) => {
    const runtime = await load()
    inquiryLoaderUtils.claim(url, config.id, opened)
    runtime.open(config, opts)
  }

  const button: InquiryClient['button'] = async (config, opts) => {
    const runtime = await load()
    inquiryLoaderUtils.claim(url, config.id, opened)

    return runtime.button(config, opts)
  }

  const bind: InquiryClient['bind'] = (target, config, opts) => {
    if (typeof document === 'undefined') {
      return () => {}
    }
    const elements = typeof target === 'string' ? Array.from(document.querySelectorAll(target)) : [target]

    const unbinds = elements.map(element => {
      const onClick = (event: Event): void => {
        const href = element.getAttribute('href')
        const mouse = event as MouseEvent
        if (href != null && (mouse.button > 0 || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey)) {
          return
        }
        event.preventDefault()
        open(config, opts).catch((error: unknown) => {
          const follow = href != null && href.trim() !== '' && !NO_DESTINATION.test(href)
          log.warn('Inquiry widget unavailable', { url, widget: config.id, follow, error })
          if (follow) {
            window.location.assign(href)
          }
        })
      }
      element.addEventListener('click', onClick)

      return () => element.removeEventListener('click', onClick)
    })

    return () => unbinds.forEach(unbind => unbind())
  }

  return { url, load, open, bind, button }
}
