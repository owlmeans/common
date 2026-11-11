import { UPLOAD_PATH_LIMITS } from '@owlmeans/upload'
import { DEFAULT_COLLECT_LIMIT, DEFAULT_UPLOAD_IGNORE } from './consts.js'
import type { CollectOptions } from './collect/types.js'
import type { DroppedRoot } from './collect/types.local.js'
import type { UploadPickedFile } from './types.js'

const fileOf = async (entry: FileSystemFileEntry): Promise<File | null> =>
  await new Promise(resolve => entry.file(resolve, () => resolve(null)))

/** One folder's children: `readEntries` answers in pages (100 in Chromium) until an empty one. */
const childrenOf = async (folder: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
  const reader = folder.createReader()
  const children: FileSystemEntry[] = []
  for (;;) {
    const page = await new Promise<FileSystemEntry[]>(resolve => reader.readEntries(resolve, () => resolve([])))
    if (page.length === 0) {
      return children
    }
    children.push(...page)
  }
}

const pathOf = (entry: FileSystemEntry): string => entry.fullPath.replace(/^\/+/, '') || entry.name

/**
 * The files of a drop (or a paste), folders walked: each file with its path relative to what was
 * dropped (`site/docs/brief.md`). Where the browser gives no entries (`webkitGetAsEntry`), the plain
 * files are taken by name. Ignored names are skipped and their folders not entered; the walk stops at
 * `limit` files and at the policy's path depth, so a link loop or a huge tree cannot hang the page.
 *
 * Call it INSIDE the event handler: the items are read synchronously, before it answers; the walk
 * itself is asynchronous.
 */
export const collectDroppedFiles = (data: DataTransfer, options: CollectOptions = {}): Promise<UploadPickedFile[]> => {
  const ignore = options.ignore ?? DEFAULT_UPLOAD_IGNORE
  const limit = options.limit ?? DEFAULT_COLLECT_LIMIT
  const items = Array.from(data.items ?? []).filter(item => item.kind === 'file')
  const roots: DroppedRoot[] = items.map(item => ({
    entry: typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null,
    file: item.getAsFile(),
  }))
  const files = Array.from(data.files ?? [])

  const walk = async (): Promise<UploadPickedFile[]> => {
    const collected: UploadPickedFile[] = []
    const full = (): boolean => collected.length >= limit
    const skipped = (name: string): boolean => ignore.includes(name)

    if (roots.length === 0) {
      for (const file of files) {
        if (!full() && !skipped(file.name)) {
          collected.push({ file, path: file.webkitRelativePath !== '' ? file.webkitRelativePath : file.name })
        }
      }
      return collected
    }

    const visit = async (entry: FileSystemEntry, depth: number): Promise<void> => {
      if (full() || skipped(entry.name)) {
        return
      }
      if (entry.isFile) {
        const file = await fileOf(entry as FileSystemFileEntry)
        if (file != null && !full()) {
          collected.push({ file, path: pathOf(entry) })
        }
        return
      }
      if (entry.isDirectory && depth < UPLOAD_PATH_LIMITS.maxSegments) {
        for (const child of await childrenOf(entry as FileSystemDirectoryEntry)) {
          await visit(child, depth + 1)
        }
      }
    }

    for (const root of roots) {
      if (root.entry != null) {
        await visit(root.entry, 1)
      } else if (root.file != null && !full() && !skipped(root.file.name)) {
        collected.push({ file: root.file, path: root.file.name })
      }
    }
    return collected
  }

  return walk()
}
