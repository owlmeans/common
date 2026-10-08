import type { InquiryFileField, InquiryFileType } from './types.js'

/** The widget bundle, served at `<crm url>/inquiry.js`. */
export const INQUIRY_SCRIPT = 'inquiry.js'

/** The CRM API sits under `<crm url>/api`. */
export const INQUIRY_API_SEGMENT = 'api'

/** POST, multipart — relative to the API (`<crm url>/api/inquiry`). */
export const INQUIRY_SUBMIT_PATH = '/inquiry'

/** GET — the advertised config (reCAPTCHA site key), relative to the API (`<crm url>/api/assets/config.json`). */
export const INQUIRY_CONFIG_PATH = '/assets/config.json'

/** The `window` property the bundle installs its `InquiryRuntime` at. */
export const INQUIRY_GLOBAL = '__owlmeansInquiry'

/**
 * The runtime contract version. The bundle reports it as `InquiryRuntime.version`, a client
 * requests the bundle with `?v=<version>` and refuses a runtime of another version. Bump it only
 * for an incompatible change of `InquiryRuntime`.
 */
export const INQUIRY_RUNTIME_VERSION = 1

/** The analytics event of a dialog open (`@owlmeans/log` `analytics` option → tag manager). */
export const INQUIRY_OPEN_EVENT = 'inquiry_dialog_open'

/** The reCAPTCHA v3 action the widget executes and the CRM requires. */
export const INQUIRY_RECAPTCHA_ACTION = 'inquiry'

/** One attachment at most, in bytes (decimal). */
export const INQUIRY_MAX_FILE_BYTES = 5_000_000

/** All attachments of one inquiry together, in bytes (decimal). */
export const INQUIRY_MAX_TOTAL_BYTES = 20_000_000

export const INQUIRY_MAX_FILES = 5

/** The multipart fields attachments travel in, in order. */
export const INQUIRY_FILE_FIELDS: readonly InquiryFileField[] = Object.freeze([
  'file0', 'file1', 'file2', 'file3', 'file4',
])

/** Accepted attachment types. SVG is not one of them: it can carry script. */
export const INQUIRY_ALLOWED_TYPES: readonly InquiryFileType[] = Object.freeze([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/csv', 'text/plain',
])

/** The file extensions of each accepted type, lower case without the dot; the first is canonical. */
export const INQUIRY_TYPE_EXTENSIONS: Readonly<Record<InquiryFileType, readonly string[]>> = Object.freeze({
  'image/png': Object.freeze(['png']),
  'image/jpeg': Object.freeze(['jpg', 'jpeg']),
  'image/gif': Object.freeze(['gif']),
  'image/webp': Object.freeze(['webp']),
  'application/pdf': Object.freeze(['pdf']),
  'text/csv': Object.freeze(['csv']),
  'text/plain': Object.freeze(['txt', 'log']),
})

export const INQUIRY_EMAIL_MAX = 254
export const INQUIRY_SUBJECT_MAX = 150
export const INQUIRY_DETAIL_MAX = 100
export const INQUIRY_BODY_MAX = 5000
/** A tab title, per language. */
export const INQUIRY_TITLE_MAX = 120
/** A tab description, per language. */
export const INQUIRY_DESCRIPTION_MAX = 600
/** A reported file name. */
export const INQUIRY_FILE_NAME_MAX = 255
/** A page or legal URL. */
export const INQUIRY_URL_MAX = 2048
/** Tabs of one widget. */
export const INQUIRY_MAX_TABS = 12

/** How the inquirer prefers to be contacted; every method but `email` asks for a detail line. */
export enum InquiryContactMethod {
  Email = 'email',
  Phone = 'phone',
  Messenger = 'messenger',
  Video = 'video',
}

/** A widget id and a tab alias: lower-case, digits and dashes, at most 32 characters. */
export const INQUIRY_ALIAS_PATTERN = '^[a-z0-9][a-z0-9-]{0,31}$'

/** A language tag as the widget and the submission carry it (`en`, `pt-BR`, `en_US`). */
export const INQUIRY_LANGUAGE_PATTERN = '^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8}){0,3}$'

/** The languages the widget ships strings for. */
export const INQUIRY_LANGUAGES: readonly string[] = Object.freeze(['en', 'pl', 'ru', 'be', 'uk', 'es', 'de', 'fr'])

/** The language every lookup falls back to. */
export const INQUIRY_FALLBACK_LANGUAGE = 'en'
