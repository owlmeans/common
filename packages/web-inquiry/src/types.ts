import type {
  InquiryButtonOptions, InquiryHandle, InquiryOpenEvent, InquiryOpenOptions, InquiryRuntime, InquiryWidgetConfig,
} from '@owlmeans/common-inquiry'

export interface InquiryClientOptions {
  /** The CRM base URL the widget is served from, e.g. `https://platform.owlmeans.com/crm`; a trailing slash is dropped. */
  url: string
  /** The widget's language, or a function read at every open (so a language switch is honoured). */
  language?: string | (() => string)
  /** The analytics event of a dialog open. Default: `INQUIRY_OPEN_EVENT`; `false` reports nothing. */
  analytics?: string | false
  /** Called once per dialog open, after the analytics event. */
  onOpen?: (event: InquiryOpenEvent) => void
  /** How long `load` waits for the runtime, in milliseconds. Default: `INQUIRY_LOAD_TIMEOUT`. */
  timeoutMs?: number
}

/**
 * The host page's handle on the inquiry widget. Nothing is fetched until the first `load`, `open`,
 * `button` or bound click; the runtime script is injected once per page whatever the number of
 * clients.
 */
export interface InquiryClient {
  /** The normalized CRM base URL. */
  readonly url: string
  /**
   * The widget runtime: injects `<url>/inquiry.js` once, waits for the runtime of
   * `INQUIRY_RUNTIME_VERSION` and configures it. Rejects with an `InquiryLoadError` on a network
   * failure, a timeout or a runtime of another version.
   */
  load: () => Promise<InquiryRuntime>
  /** Load, then open the widget's dialog. */
  open: (config: InquiryWidgetConfig, opts?: InquiryOpenOptions) => Promise<void>
  /**
   * Open the dialog from a trigger's clicks — an element, or every element a selector matches now.
   * A click is taken over (`preventDefault`) and opens the dialog; when the widget cannot load, an
   * anchor trigger follows its own `href` instead. A modified click (new tab, new window) on an
   * anchor is left to the browser. Returns the function that unbinds every bound element.
   */
  bind: (target: Element | string, config: InquiryWidgetConfig, opts?: InquiryOpenOptions) => () => void
  /** Load, then mount the widget's floating button. */
  button: (config: InquiryWidgetConfig, opts?: InquiryButtonOptions) => Promise<InquiryHandle>
}

/** Why the runtime could not be loaded. */
export type InquiryLoadFailure = 'environment' | 'network' | 'timeout' | 'version'
