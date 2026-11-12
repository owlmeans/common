/**
 * Why a captcha could not give a token: the provider's script failed to `load`, did not become ready
 * in time (`timeout`), there is no page, no API or no client to use (`unavailable`), or the provider
 * gave no token (`execute`).
 */
export type CaptchaLoadErrorReason = 'load' | 'timeout' | 'execute' | 'unavailable'

/**
 * A provider's own strings in one language. `notice` is the sentence a page shows when it hides the
 * provider's badge, `{{name}}` marking a link whose label is the entry `name` of the same texts and
 * whose address is `CaptchaNotice.links[name]`.
 */
export interface CaptchaTexts {
  [key: string]: string
}

/** The notice a page must show next to a form when it hides the provider's own badge. */
export interface CaptchaNotice {
  /** The address of each link the notice sentence names, by placeholder name. */
  links: Readonly<Record<string, string>>
}

/** A notice resolved in one language: the sentence and its links, ready to render. */
export interface CaptchaNoticeText {
  /** The sentence, `{{name}}` marking each link. */
  sentence: string
  /** Each link the sentence names: its label in the same language and its address. */
  links: Record<string, CaptchaNoticeLink>
}

export interface CaptchaNoticeLink {
  text: string
  href: string
}

/**
 * The browser half of one captcha provider: how a page gets a token from it. A provider package
 * builds one (and exports an `append*` helper registering it in `captchaClients`); a page picks the
 * client by the provider id its server advertises. Nothing touches the page until `load` or
 * `execute` is called.
 *
 * `W` is the widget's type — a React component in `@owlmeans/web-captcha/react`
 * (`CaptchaWidgetClient`); this package root names no UI library.
 */
export interface CaptchaClient<W = unknown> {
  /** The provider id — the same id the server's provider advertises (`CaptchaClientSettings.provider`). */
  id: string
  /**
   * Prepare the provider for a site key (load its script once per key); resolves when tokens can be
   * asked for. A failure is forgotten, so the next call loads again.
   *
   * @throws {CaptchaLoadError} `load`, `timeout` or `unavailable`.
   */
  load: (siteKey: string) => Promise<void>
  /**
   * A fresh token for `action` under `siteKey`, loading first when needed.
   *
   * @throws {CaptchaLoadError} what `load` throws, or `execute` when the provider gives no token in time.
   */
  execute: (siteKey: string, action: string) => Promise<string>
  /** The notice a page shows while the provider's badge is hidden; absent = none is needed. */
  notice?: CaptchaNotice
  /** The provider's own strings per language (`en` always among them); the notice reads them. */
  texts?: Readonly<Record<string, CaptchaTexts>>
  /** An interactive widget (a checkbox, a puzzle) for a page that renders one; absent = invisible only. */
  widget?: W
  /**
   * The id of the client config record whose `value` is this provider's site key, for an app that
   * delivers keys as OwlMeans client plugin records (a panel's sign-in screen reads it).
   */
  siteKeyRecord?: string
}

/**
 * The captcha clients of a page, by provider id — what a form looks up by the id its server
 * advertises. One page, one registry: `captchaClients`.
 */
export interface CaptchaClients {
  /** Add a client; a client of the same id is replaced. */
  register: <W>(client: CaptchaClient<W>) => CaptchaClient<W>
  /**
   * The client of `id`; without an id, the only registered client. `null` when none is registered
   * under `id`, or when no id is given and none or several are registered.
   */
  get: (id?: string | null) => CaptchaClient | null
  /** Every registered client, in registration order. */
  list: () => CaptchaClient[]
}

/** Reads a client's notice in the reader's language. */
export interface CaptchaNoticeHelper {
  /**
   * The client's notice in `language` (its base language — `de-AT` reads `de`), English when the
   * client has no strings in it; `null` when the client needs no notice or ships no sentence for it.
   */
  noticeOf: (client: CaptchaClient | null | undefined, language?: string | null) => CaptchaNoticeText | null
}
