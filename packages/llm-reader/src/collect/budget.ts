import { ReaderLimitError } from '../errors.js'
import type { CollectLimits } from './types.js'
import type { CollectBudget, PageAllowance } from './types.local.js'

/** One collect's limits: files are reserved as they are admitted, bytes counted as they flow. */
export const makeCollectBudget = (limits: CollectLimits): CollectBudget => {
  let files = 0
  let bytes = 0

  const admit: CollectBudget['admit'] = (size, page) => {
    if (files >= limits.maxFiles) return 'max-files'
    if (size != null && size > limits.maxFileBytes) return 'max-file-bytes'
    if (size != null && bytes + size > limits.maxTotalBytes) return 'max-total-bytes'
    if (page != null) {
      if (page.assets >= limits.maxAssets) return 'max-assets'
      if (size != null && page.bytes + size > limits.maxAssetBytes) return 'max-asset-bytes'
      page.assets++
    }
    files++
    return undefined
  }

  const release: CollectBudget['release'] = (count, page) => {
    files = Math.max(0, files - 1)
    bytes -= count
    if (page != null) {
      page.assets = Math.max(0, page.assets - 1)
      page.bytes -= count
    }
  }

  const meter: CollectBudget['meter'] = (stream, page) => {
    let seen = 0
    let exceeded: string | undefined
    const counted = stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        seen += chunk.byteLength
        bytes += chunk.byteLength
        if (page != null) page.bytes += chunk.byteLength
        exceeded = seen > limits.maxFileBytes
          ? 'max-file-bytes'
          : bytes > limits.maxTotalBytes
            ? 'max-total-bytes'
            : page != null && page.bytes > limits.maxAssetBytes ? 'max-asset-bytes' : undefined
        if (exceeded != null) controller.error(new ReaderLimitError(exceeded))
        else controller.enqueue(chunk)
      },
    }))
    return { stream: counted, bytes: () => seen, exceeded: () => exceeded }
  }

  const page = (): PageAllowance => ({ assets: 0, bytes: 0 })

  return { admit, release, meter, page }
}
