import { useMemo, useRef } from 'react'
import type { ChangeEvent, FC } from 'react'
import { FilePlus, FolderPlus } from 'lucide-react'
import { Button } from '../@/components/ui/button.js'
import { cn } from '../@/lib/utils.js'
import { makeUploadText } from '../text.js'
import type { UploadPickersProps } from './types.js'

/**
 * "Add files" and "Add folder": real buttons opening hidden file inputs (`multiple`, and
 * `webkitdirectory` for the folder, whose files keep their relative paths). The picked files go to the
 * queue. Large touch targets below 768px; never the native `disabled` — a blocked picker carries
 * `aria-disabled` and ignores the press.
 */
export const UploadPickers: FC<UploadPickersProps> = ({
  queue, files = true, folder = true, accept, disabled = false, variant = 'outline', size = 'default', onAdded, className,
  translate, locale,
}) => {
  const text = useMemo(() => makeUploadText(translate, locale), [translate, locale])
  const filesInput = useRef<HTMLInputElement | null>(null)
  const folderInput = useRef<HTMLInputElement | null>(null)

  const open = (input: HTMLInputElement | null): void => {
    if (!disabled) {
      input?.click()
    }
  }

  const picked = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget
    const chosen = Array.from(input.files ?? [])
    // Cleared, so picking the same file again is a change again.
    input.value = ''
    if (chosen.length > 0) {
      void queue.add(chosen).then(entries => onAdded?.(entries))
    }
  }

  const button = 'max-md:h-11 max-md:min-w-11 max-md:px-4'

  return <div data-upload-pickers="" className={cn('flex flex-wrap items-center gap-2', className)}>
    {files && <>
      <Button
        type="button" variant={variant} size={size} className={button} data-upload-add-files=""
        aria-disabled={disabled || undefined} onClick={() => open(filesInput.current)}
      >
        <FilePlus aria-hidden />
        {text.text('pickers.files')}
      </Button>
      <input
        ref={filesInput} type="file" multiple hidden tabIndex={-1} aria-hidden="true" accept={accept}
        data-upload-input="files" onChange={picked}
      />
    </>}
    {folder && <>
      <Button
        type="button" variant={variant} size={size} className={button} data-upload-add-folder=""
        aria-disabled={disabled || undefined} onClick={() => open(folderInput.current)}
      >
        <FolderPlus aria-hidden />
        {text.text('pickers.folder')}
      </Button>
      <input
        ref={element => {
          folderInput.current = element
          if (element != null) {
            element.webkitdirectory = true
          }
        }}
        type="file" multiple hidden tabIndex={-1} aria-hidden="true" data-upload-input="folder" onChange={picked}
      />
    </>}
  </div>
}
