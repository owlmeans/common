/** The name a PDF goes out under when its part names none. */
export const DEFAULT_DOCUMENT_NAME = 'document.pdf'

/** Image media types read as another one. */
export const IMAGE_TYPE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
})
