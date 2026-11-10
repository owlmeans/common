/** The format each Google editor file exports as. */
export interface GoogleExportFormats {
  document?: 'docx' | 'pdf' | 'odt' | 'rtf' | 'txt' | 'epub' | 'md' | 'html'
  spreadsheet?: 'xlsx' | 'ods' | 'pdf' | 'csv' | 'tsv'
  presentation?: 'pptx' | 'odp' | 'pdf' | 'txt'
  drawing?: 'png' | 'svg' | 'pdf' | 'jpg'
}

/** Where Google answers; tests point these at a stand-in. */
export interface GoogleDriveOrigins {
  drive?: string
  usercontent?: string
  docs?: string
  accounts?: string
}

export interface GoogleDriveResolverOptions {
  exports?: GoogleExportFormats
  origins?: GoogleDriveOrigins
  /** Bytes of an interstitial page read. Default 256 KiB. */
  maxPageBytes?: number
}
