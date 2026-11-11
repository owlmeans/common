import type { PropsWithChildren, ReactNode } from 'react'
import type { UploadEntry, UploadI18n, UploadQueue, UploadQueueActions } from '../types.js'

/** `UploadDropzone`'s props. */
export interface UploadDropzoneProps extends UploadI18n, PropsWithChildren {
  /** The queue a drop (or a pasted file) goes to. */
  queue: Pick<UploadQueueActions, 'add'>
  /** Drops are refused (no overlay, nothing added) — the content stays as it is. */
  disabled?: boolean
  /** Files pasted into the area are added too (text pastes pass through). Default `true`. */
  paste?: boolean
  /** Called with the entries a drop or a paste added. */
  onAdded?: (entries: UploadEntry[]) => void
  /** The overlay's own content, instead of the icon, title and hint. */
  overlay?: ReactNode
  /** Merged over the wrapper's classes (`relative` is always kept). */
  className?: string
  id?: string
}

/** `UploadPickers`' props. */
export interface UploadPickersProps extends UploadI18n {
  queue: Pick<UploadQueueActions, 'add'>
  /** Show "Add files". Default `true`. */
  files?: boolean
  /** Show "Add folder" (`webkitdirectory`). Default `true`. */
  folder?: boolean
  /** The file input's `accept`. The server decides anyway. */
  accept?: string
  /** The buttons explain nothing and do nothing while set (`aria-disabled`, never the native attribute). */
  disabled?: boolean
  variant?: 'outline' | 'secondary' | 'ghost' | 'default'
  size?: 'sm' | 'default'
  onAdded?: (entries: UploadEntry[]) => void
  className?: string
}

/** `UploadList`'s props. */
export interface UploadListProps extends UploadI18n {
  queue: Pick<UploadQueue, 'entries' | 'policy' | 'totals' | 'violations' | 'uploading' | 'progress' | 'remove'>
  /** Rows carry a remove button (not while uploading). Default `true`. */
  removable?: boolean
  /** The totals line. Default `true`. */
  totals?: boolean
  /** The policy's limits under the list. Default `true`. */
  hints?: boolean
  /** What renders while the queue is empty. Default nothing. */
  empty?: ReactNode
  className?: string
}
