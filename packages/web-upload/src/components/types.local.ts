import type { UploadText } from '../text/types.js'
import type { UploadEntry } from '../types.js'

/** One row of `UploadList`. */
export interface RowProps {
  entry: UploadEntry
  text: UploadText
  detail: string | null
  removable: boolean
  onRemove: (id: string) => void
}
