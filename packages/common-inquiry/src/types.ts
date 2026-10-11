import type { InquiryContactMethod } from './consts.js'

/**
 * A text the widget shows: one string for every language, or one string per language keyed by
 * its tag (`{ en: 'Report an issue', pl: 'Zgłoś problem' }`). A missing language falls back to the
 * primary subtag, then English, then the first entry (`inquiryConfigHelper.text`).
 */
export type LocalizedText = string | Record<string, string>

/** One of the attachment types the CRM accepts — the detected type, never only the declared one. */
export type InquiryFileType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'application/pdf'
  | 'text/csv'
  | 'text/plain'

/** The multipart field an attachment travels in. */
export type InquiryFileField = 'file0' | 'file1' | 'file2' | 'file3' | 'file4'

/** Where the floating button sits. */
export type InquiryButtonPosition = 'bottom-right' | 'bottom-left'

/** One intent of a widget — a tab of the dialog. */
export interface InquiryTab {
  /** Stable machine name (`INQUIRY_ALIAS_PATTERN`); it prefixes the mail subject. */
  alias: string
  title: LocalizedText
  /** One or two sentences under the tab strip. */
  description?: LocalizedText
}

/** The documents the inquirer consents to before sending. */
export interface InquiryLegalLinks {
  /** An absolute http(s) URL, or a root-relative path resolved against the host page. */
  terms: string
  /** An absolute http(s) URL, or a root-relative path resolved against the host page. */
  privacy: string
}

/**
 * What a host page asks the widget to show.
 *
 * A config with ONE tab renders without a tab strip — the dialog is then that single intent, its
 * title the dialog's title. Two or more tabs render a tab strip, `defaultTab` (or the first)
 * selected.
 */
export interface InquiryWidgetConfig {
  /** The widget's id (`INQUIRY_ALIAS_PATTERN`): one mounted dialog per id, reported in analytics and mail. */
  id: string
  tabs: InquiryTab[]
  /** The alias of the tab selected when no other is asked for. Default: the first tab. */
  defaultTab?: string
  legal: InquiryLegalLinks
  /** The interface language; default: the runtime's configured language, then the document's. */
  language?: string
}

/** A preset reply address, resolved when the dialog opens. A missing result clears the email. */
export type InquiryEmailValue = string | null | undefined

/** A reply address or a lazy provider; a pending provider shows the widget's email spinner. */
export type InquiryEmailPreset = string | (() => InquiryEmailValue | Promise<InquiryEmailValue>)

export interface InquiryEmailOptions {
  /** Applied on every dialog open, replacing any previously edited email. Omit to keep manual entry. */
  email?: InquiryEmailPreset
}

export interface InquiryOpenOptions extends InquiryEmailOptions {
  /** The alias of the tab to select; an unknown alias selects the default tab. */
  tab?: string
  /** Which trigger opened the dialog (`fab`, `menu`, `pricing-card` …), reported in analytics. */
  source?: string
}

export interface InquiryButtonOptions extends InquiryEmailOptions {
  /** Default: `bottom-right`. */
  position?: InquiryButtonPosition
  /** Distance from the viewport edges in CSS pixels. */
  offset?: number
  /** The button's accessible label (and tooltip); default: the widget's own "Contact us". */
  label?: LocalizedText
  /** Reported as the source of every open the button makes. Default: `fab`. */
  source?: string
}

/** One dialog open, as analytics and `onOpen` callbacks receive it. */
export interface InquiryOpenEvent {
  /** `InquiryWidgetConfig.id`. */
  widget: string
  /** The alias of the tab the dialog opened on. */
  tab: string
  source?: string
}

/** One attachment, described in the submission's `files` field (a JSON string of these). */
export interface InquiryFileMeta {
  /** The multipart field carrying the bytes. */
  field: InquiryFileField
  /** The file name as the inquirer's device reported it. */
  name: string
  /** The declared type; the CRM re-detects it from the bytes and refuses a mismatch. */
  type: InquiryFileType
  /** Size in bytes. */
  size: number
}

/**
 * The multipart text fields of one inquiry.
 *
 * The multipart parser hands every text field over as a string, so `consent` arrives as `'true'`
 * and `files` is a JSON string of `InquiryFileMeta[]` the handler parses and validates
 * (`InquiryFileMetaListSchema`). Every field `files` names must be present.
 */
export interface InquirySubmissionFields {
  /** `InquiryWidgetConfig.id`. */
  widget: string
  /** The tab's alias. */
  tab: string
  /** The tab's title as the inquirer saw it. */
  tabTitle?: string
  /** The reply address. */
  email: string
  subject: string
  contactMethod: InquiryContactMethod
  /** A phone number, a messenger handle or a preferred call time — whatever the method needs. */
  contactDetail?: string
  body: string
  /** The interface language the inquirer used. */
  language?: string
  /** The page the dialog was opened on. */
  page?: string
  /** The terms the inquirer consented to, absolute. */
  terms?: string
  /** The privacy notice the inquirer consented to, absolute. */
  privacy?: string
  /** The consent checkbox: only `true` is accepted. */
  consent: true | 'true'
  /** JSON of `InquiryFileMeta[]`; `'[]'` without attachments. */
  files: string
}

/** The whole multipart body as the server receives it: the text fields plus the file buffers. */
export interface InquirySubmission extends InquirySubmissionFields {
  file0?: Uint8Array
  file1?: Uint8Array
  file2?: Uint8Array
  file3?: Uint8Array
  file4?: Uint8Array
}

/** What the CRM answers to an accepted inquiry. */
export interface InquiryReceipt {
  id: string
  /** Whether the mail was queued (always, once accepted). */
  queued: boolean
}

/** What a host (through `@owlmeans/web-inquiry`) tells the runtime once it is loaded. */
export interface InquiryRuntimeOptions {
  /** The CRM base URL the bundle was loaded from, without a trailing slash (`https://<web>/crm`). */
  url: string
  /** The interface language, or a function read at every open (so a language switch is honoured). */
  language?: string | (() => string)
  /**
   * Called exactly once per dialog open, whatever opened it — `open`, a handle's `open` or the
   * floating button. An `open` of a dialog that is already open does not call it again.
   */
  onOpen?: (event: InquiryOpenEvent) => void
}

/** A mounted floating button. */
export interface InquiryHandle {
  /** Open the button's dialog as if it were clicked (its `source` unless `opts` names another). */
  open: (opts?: InquiryOpenOptions) => void
  /** Replace the widget's config (texts, tabs, language) in place. */
  update: (config: InquiryWidgetConfig) => void
  /** Remove the button and its dialog. */
  unmount: () => void
}

/**
 * The contract the widget bundle (`INQUIRY_SCRIPT`) installs at `window[INQUIRY_GLOBAL]`.
 *
 * A host never loads the bundle by hand: `@owlmeans/web-inquiry` injects it once, checks `version`
 * against `INQUIRY_RUNTIME_VERSION` and calls `configure` before anything else.
 */
export interface InquiryRuntime {
  /** `INQUIRY_RUNTIME_VERSION` of the bundle; a client refuses a runtime of another version. */
  version: number
  /** Set (or replace) the page-wide options; the last call wins. */
  configure: (options: InquiryRuntimeOptions) => void
  /** Open the widget's dialog (mounting it on first use) on `opts.tab` or the default tab. */
  open: (config: InquiryWidgetConfig, opts?: InquiryOpenOptions) => void
  /** Mount the widget's floating button; a second call for the same `config.id` updates it. */
  button: (config: InquiryWidgetConfig, opts?: InquiryButtonOptions) => InquiryHandle
  /** Remove one widget (button and dialog) by its id, or every widget. */
  unmount: (id?: string) => void
}

/** The `window` slot the runtime lives in. */
export interface InquiryWindow {
  __owlmeansInquiry?: InquiryRuntime
}
