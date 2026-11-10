import type { GoogleDriveOrigins, GoogleExportFormats } from './types.js'

export const GOOGLE_DRIVE_RESOLVER = 'google-drive'

export const DEFAULT_GOOGLE_ORIGINS: Readonly<Required<GoogleDriveOrigins>> = Object.freeze({
  drive: 'https://drive.google.com',
  usercontent: 'https://drive.usercontent.google.com',
  docs: 'https://docs.google.com',
  accounts: 'https://accounts.google.com',
})

export const DEFAULT_EXPORT_FORMATS: Readonly<Required<GoogleExportFormats>> = Object.freeze({
  document: 'docx', spreadsheet: 'xlsx', presentation: 'pptx', drawing: 'png',
})

/** What a Drive file id looks like. */
export const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/

/** Follow-ups one Drive download may take (interstitial form, legacy confirm, cookie confirm). */
export const MAX_DRIVE_STEPS = 3

export const DEFAULT_DRIVE_PAGE_BYTES = 256 * 1024
