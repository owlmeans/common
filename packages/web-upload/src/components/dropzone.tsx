import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, FC } from 'react'
import { CloudUpload } from 'lucide-react'
import { cn } from '../@/lib/utils.js'
import { makeUploadText } from '../text.js'
import type { UploadEntry } from '../types.js'
import type { UploadDropzoneProps } from './types.js'

const carriesFiles = (data: DataTransfer | null): boolean => data != null && Array.from(data.types ?? []).includes('Files')

/**
 * Makes everything it wraps a drop target: dragging files over ANY part of it raises an overlay, and
 * a drop adds them — folders walked, paths kept — to the queue. Files pasted into it are added too.
 * The children stay untouched (a form keeps working under it); screen readers get the alternatives
 * in a description and hear how many files a drop added.
 */
export const UploadDropzone: FC<UploadDropzoneProps> = ({
  queue, disabled = false, paste = true, onAdded, overlay, className, id, children, translate, locale,
}) => {
  const text = useMemo(() => makeUploadText(translate, locale), [translate, locale])
  const [dragging, setDragging] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const depth = useRef(0)
  const description = useId()

  // A drag that ends outside (dropped elsewhere, Escape) never sends this element a `dragleave`.
  useEffect(() => {
    if (!dragging) {
      return
    }
    const reset = (): void => {
      depth.current = 0
      setDragging(false)
    }
    window.addEventListener('dragend', reset)
    window.addEventListener('drop', reset)

    return () => {
      window.removeEventListener('dragend', reset)
      window.removeEventListener('drop', reset)
    }
  }, [dragging])

  const added = (pending: Promise<UploadEntry[]>): void => {
    void pending.then(entries => {
      if (entries.length > 0) {
        setAnnouncement(text.text('dropzone.added', { count: text.count(entries.length) }))
      }
      onAdded?.(entries)
    })
  }

  const onDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (!carriesFiles(event.dataTransfer)) {
      return
    }
    event.preventDefault()
    depth.current += 1
    if (!disabled) {
      setDragging(true)
    }
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!carriesFiles(event.dataTransfer)) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!carriesFiles(event.dataTransfer)) {
      return
    }
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) {
      setDragging(false)
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!carriesFiles(event.dataTransfer)) {
      return
    }
    // Never let the browser open a dropped file in place of the page, refused drop or not.
    event.preventDefault()
    depth.current = 0
    setDragging(false)
    if (!disabled) {
      // Inside the handler: the drop's items are readable only while it is dispatched.
      added(queue.add(event.dataTransfer))
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (!paste || disabled || (event.clipboardData?.files.length ?? 0) === 0) {
      return
    }
    event.preventDefault()
    added(queue.add(event.clipboardData))
  }

  return <div
    id={id}
    role="group"
    aria-describedby={description}
    data-upload-dropzone=""
    data-dragging={dragging ? 'true' : 'false'}
    className={cn('relative', className)}
    onDragEnter={onDragEnter}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    onPaste={onPaste}
  >
    {children}
    <p id={description} className="sr-only">{text.text('dropzone.description')}</p>
    <div role="status" aria-live="polite" className="sr-only" data-upload-announcement="">{announcement}</div>
    {dragging && <div
      aria-hidden="true"
      data-upload-overlay=""
      className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[inherit] border-2 border-dashed border-primary bg-background/90 p-4 text-center text-foreground backdrop-blur-sm"
    >
      {overlay ?? <>
        <CloudUpload aria-hidden className="size-10 text-primary" />
        <span className="text-base font-semibold">{text.text('dropzone.title')}</span>
        <span className="text-sm text-muted-foreground">{text.text('dropzone.hint')}</span>
      </>}
    </div>}
  </div>
}
