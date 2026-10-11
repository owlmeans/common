import {
  INQUIRY_GLOBAL, INQUIRY_RUNTIME_VERSION, INQUIRY_SCRIPT, type InquiryRuntime, type InquiryWindow,
} from '@owlmeans/common-inquiry'
import { INQUIRY_SCRIPT_ATTRIBUTE } from '../consts.js'
import { POLL_INTERVAL } from '../consts.local.js'
import { InquiryLoadError } from '../errors.js'
import type { InquiryLoaderUtils, InquiryOpenRoute } from './loader/types.js'

export const createInquiryLoaderUtils = (): InquiryLoaderUtils => {
  const loads = new Map<string, Promise<InquiryRuntime>>()
  const routes = new Map<string, InquiryOpenRoute>()

  const globalOf = (): InquiryRuntime | undefined =>
    (window as unknown as InquiryWindow)[INQUIRY_GLOBAL as keyof InquiryWindow]

  const scriptUrl = (url: string): string => `${url}/${INQUIRY_SCRIPT}?v=${INQUIRY_RUNTIME_VERSION}`

  /** A runtime script already in the page — injected by another client or another copy of this package. */
  const existingScript = (src: string): HTMLScriptElement | undefined =>
    Array.from(document.querySelectorAll<HTMLScriptElement>(`script[${INQUIRY_SCRIPT_ATTRIBUTE}]`))
      .find(script => script.getAttribute('src') === src)

  const inject = (url: string, timeoutMs: number): Promise<InquiryRuntime> =>
    new Promise<InquiryRuntime>((resolve, reject) => {
      const src = scriptUrl(url)
      const found = existingScript(src)
      const script = found ?? document.createElement('script')
      let settled = false
      let poll: number | undefined
      let timer: number | undefined

      const settle = (runtime?: InquiryRuntime, error?: InquiryLoadError): void => {
        if (settled) {
          return
        }
        settled = true
        window.clearInterval(poll)
        window.clearTimeout(timer)
        script.removeEventListener('load', loaded)
        script.removeEventListener('error', failed)
        if (runtime != null) {
          resolve(runtime)
          return
        }
        loads.delete(url)
        if (found == null) {
          script.remove()
        }
        reject(error)
      }

      /** Whether the runtime is there — settling either way once it is. */
      const check = (): boolean => {
        const runtime = globalOf()
        if (runtime == null) {
          return false
        }
        if (runtime.version !== INQUIRY_RUNTIME_VERSION) {
          settle(undefined, new InquiryLoadError(
            'version', `Inquiry runtime version ${String(runtime.version)} is not ${INQUIRY_RUNTIME_VERSION}`
          ))
        } else {
          settle(runtime)
        }

        return true
      }

      const loaded = (): void => {
        if (!check()) {
          settle(undefined, new InquiryLoadError('network', `${src} loaded without installing the inquiry runtime`))
        }
      }
      const failed = (): void => {
        settle(undefined, new InquiryLoadError('network', `${src} failed to load`))
      }

      script.addEventListener('load', loaded)
      script.addEventListener('error', failed)
      poll = window.setInterval(check, POLL_INTERVAL)
      timer = window.setTimeout(() => {
        settle(undefined, new InquiryLoadError('timeout', `${src} did not install the inquiry runtime in ${timeoutMs} ms`))
      }, timeoutMs)

      if (found == null) {
        script.src = src
        script.async = true
        script.setAttribute(INQUIRY_SCRIPT_ATTRIBUTE, '')
        document.head.appendChild(script)
      }
    })

  const load: InquiryLoaderUtils['load'] = (url, timeoutMs) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return Promise.reject(new InquiryLoadError('environment', 'The inquiry widget needs a browser document'))
    }
    const ready = globalOf()
    if (ready != null && ready.version === INQUIRY_RUNTIME_VERSION) {
      return Promise.resolve(ready)
    }
    const pending = loads.get(url)
    if (pending != null) {
      return pending
    }
    const loading = inject(url, timeoutMs)
    loads.set(url, loading)

    return loading
  }

  const routeOf = (url: string): InquiryOpenRoute => {
    const known = routes.get(url)
    if (known != null) {
      return known
    }
    const route: InquiryOpenRoute = {
      handlers: new Map(),
      dispatch: event => (route.handlers.get(event.widget) ?? route.last)?.(event),
    }
    routes.set(url, route)

    return route
  }

  const claim: InquiryLoaderUtils['claim'] = (url, id, handler) => {
    const route = routeOf(url)
    route.handlers.set(id, handler)
    route.last = handler
  }

  const dispatcher: InquiryLoaderUtils['dispatcher'] = url => routeOf(url).dispatch

  return { load, claim, dispatcher }
}

export const inquiryLoaderUtils = createInquiryLoaderUtils()
