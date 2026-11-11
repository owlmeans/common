import { FileKind } from '../consts.js'
import {
  DIAGRAM_IMAGE_NAMES, DRAWIO_IMAGE_MARKERS, EXCALIDRAW_IMAGE_MARKERS, STL_BINARY_HEADER, STL_BINARY_TRIANGLE,
} from './consts.local.js'
import type { DetectedType, DiagramFormat } from './types.js'
import type { FormatReader } from './types.local.js'

/** Structure rules no magic number carries: binary STL sizes, diagrams saved inside images. */
export const createFormatReader = (): FormatReader => {
  const isBinaryStl = (head: Uint8Array, size: number | undefined): boolean => {
    if (size == null || size < STL_BINARY_HEADER || head.length < STL_BINARY_HEADER) {
      return false
    }
    const triangles = (head[80] | (head[81] << 8) | (head[82] << 16) | (head[83] << 24)) >>> 0

    return triangles > 0 && STL_BINARY_HEADER + triangles * STL_BINARY_TRIANGLE === size
  }

  const diagramOf = (detected: DetectedType | undefined, head: Uint8Array, name?: string): DiagramFormat | undefined => {
    if (detected == null) {
      return undefined
    }
    if (detected.kind === FileKind.Diagram) {
      return detected.ext === 'excalidraw' ? 'excalidraw' : 'drawio'
    }
    if (detected.ext !== 'svg' && detected.ext !== 'png') {
      return undefined
    }
    const named = name != null ? DIAGRAM_IMAGE_NAMES.find(([pattern]) => pattern.test(name))?.[1] : undefined
    if (named != null) {
      return named
    }
    const text = Buffer.from(head.buffer, head.byteOffset, head.byteLength).toString('latin1')
    if (EXCALIDRAW_IMAGE_MARKERS.some(marker => text.includes(marker))) {
      return 'excalidraw'
    }
    // A png keeps the model in a text chunk named after it, an svg in its `content` attribute.
    const drawio = detected.ext === 'png'
      ? DRAWIO_IMAGE_MARKERS.some(marker => text.includes(`tEXt${marker}`) || text.includes(`zTXt${marker}`))
      : DRAWIO_IMAGE_MARKERS.some(marker => new RegExp(`(<|&lt;|%3C)${marker}[\\s>&%]`).test(text))

    return drawio ? 'drawio' : undefined
  }

  return { isBinaryStl, diagramOf }
}
