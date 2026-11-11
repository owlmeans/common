import type { DiagramFormat } from './types.js'

/** The PDF names that make a document act rather than show (`/JS` only as a whole name). */
export const PDF_ACTIVE_NAMES = /\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia)(?![A-Za-z0-9])/

/** How much one compressed object stream of a PDF may inflate to before it counts as active. */
export const PDF_INFLATE_LIMIT = 16 * 1024 * 1024

/** How far before a `stream` keyword its dictionary is looked for. */
export const PDF_DICTIONARY_WINDOW = 4096

/** The `%%EOF` marker that closes a PDF. */
export const PDF_EOF_MARKER = '%%EOF'

/** Python 3 bytecode magic numbers (little-endian, followed by `\r\n`) fall in this range. */
export const PYC3_MAGIC_RANGE: readonly [number, number] = Object.freeze([3000, 3999]) as readonly [number, number]

/** The first Python 3 magic (3.7) whose header carries a flags word, of which only the low two bits exist. */
export const PYC_FLAGS_MAGIC = 3390

/** Python 1.x/2.x bytecode magic numbers. */
export const PYC2_MAGICS: readonly number[] = Object.freeze([
  20121, 50428, 50823, 60202, 60717, 62011, 62021, 62041, 62051, 62061, 62071, 62081, 62091, 62092, 62101, 62111,
  62121, 62131, 62151, 62161, 62171, 62181, 62191, 62201, 62211,
])

/** PE `Characteristics` flag of a DLL. */
export const PE_DLL_FLAG = 0x2000

/** The farthest `e_lfanew` a PE header is looked for at. */
export const PE_HEADER_LIMIT = 64 * 1024

/** Bytes of a binary STL before its triangles, and per triangle. */
export const STL_BINARY_HEADER = 84
export const STL_BINARY_TRIANGLE = 50

/** Markers a draw.io export keeps in the image it was saved as (an svg `content` attribute, a png text chunk). */
export const DRAWIO_IMAGE_MARKERS: readonly string[] = Object.freeze([
  'mxfile', 'mxGraphModel',
])

/** Markers an Excalidraw export keeps in the image it was saved as. */
export const EXCALIDRAW_IMAGE_MARKERS: readonly string[] = Object.freeze([
  'svg-source:excalidraw', 'application/vnd.excalidraw+json',
])

/** Compound names that keep an image kind while naming the diagram inside. */
export const DIAGRAM_IMAGE_NAMES: ReadonlyArray<readonly [RegExp, DiagramFormat]> = Object.freeze([
  [/\.(drawio|dio)\.(svg|png)$/i, 'drawio'],
  [/\.excalidraw\.(svg|png)$/i, 'excalidraw'],
] as const)
