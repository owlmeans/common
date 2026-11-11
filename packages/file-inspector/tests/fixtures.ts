import { Readable } from 'node:stream'
import { deflateSync } from 'node:zlib'
import tarStream from 'tar-stream'
import yazl from 'yazl'

export const bytes = (...parts: Array<number[] | string | Uint8Array>): Buffer => Buffer.concat(parts.map(part =>
  typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part)))

const u16 = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff]
const u32 = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]

// Images, media, documents

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'
)
export const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 'JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0], new Uint8Array(64), [0xff, 0xd9])
export const GIF = bytes('GIF89a', [1, 0, 1, 0, 0x80, 0, 0], new Uint8Array(32), [0x3b])
export const WEBP = bytes('RIFF', [26, 0, 0, 0], 'WEBPVP8 ', [14, 0, 0, 0], new Uint8Array(14))
export const PDF = bytes('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')
export const MP3 = bytes('ID3', [3, 0, 0, 0, 0, 0, 0], [0xff, 0xfb, 0x90, 0x64], new Uint8Array(413), [0xff, 0xfb, 0x90, 0x64], new Uint8Array(413))
export const WAV = bytes('RIFF', [36, 0, 0, 0], 'WAVEfmt ', [16, 0, 0, 0, 1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0], 'data', [0, 0, 0, 0])
export const OGG = bytes('OggS', [0, 2], new Uint8Array(8), [1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1, 30], [1], 'vorbis', new Uint8Array(23))
export const FLAC = bytes('fLaC', [0x80, 0, 0, 34], new Uint8Array(34))
export const MP4 = bytes([0, 0, 0, 0x18], 'ftypisom', [0, 0, 2, 0], 'isomiso2', [0, 0, 0, 8], 'free')
export const WEBM = bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1, 0x42, 0xf7, 0x81, 1, 0x42, 0xf2, 0x81, 4, 0x42, 0xf3, 0x81, 8,
  0x42, 0x82, 0x84], 'webm', [0x42, 0x87, 0x81, 4, 0x42, 0x85, 0x81, 2])

export const CSV = Buffer.from('name,age,city\nAnn,31,Oslo\nBob,42,Rome\nCid,27,Lima\n')
export const TSV = Buffer.from('name\tage\nAnn\t31\nBob\t42\n')
export const JSON_TEXT = Buffer.from('{"name":"Ann","tags":["a","b"]}')
export const HTML_ERROR = Buffer.from('<!DOCTYPE html><html><head><title>Error</title></head><body><h1>404</h1></body></html>')
export const SVG = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>')
export const ACTIVE_SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>')
export const TS_CODE = Buffer.from('import { readFile } from "node:fs/promises"\nexport const answer: number = 42\n')
export const PY_CODE = Buffer.from('def main():\n    print("hi")\n\nif __name__ == "__main__":\n    main()\n')
export const SHEBANG = Buffer.from('#!/usr/bin/env python3\nprint("hi")\n')
export const MARKDOWN = Buffer.from('# Title\n\nSome *text* here.\n')
export const PLAIN = Buffer.from('Just a plain sentence of text.\nAnd a second line.\n')
export const UTF16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Hello, wide world', 'utf16le')])

// PDFs

export const pdfOf = (body: string | Uint8Array, eof: boolean = true): Buffer => bytes('%PDF-1.7\n', body, eof ? '\n%%EOF\n' : '\n')
export const CLEAN_PDF = pdfOf('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj')
/** A PDF whose only dictionary sits in a FlateDecode object stream. */
export const objectStreamPdf = (content: string): Buffer => {
  const packed = deflateSync(Buffer.from(content, 'latin1'))
  return pdfOf(bytes(`5 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${packed.length} >>\nstream\r\n`, packed,
    '\r\nendstream\nendobj'))
}
/** A PDF of `size` bytes: `head` objects, comment padding, then `tail` objects before the trailer. */
export const paddedPdf = (size: number, tail: string = ''): Buffer => {
  const start = bytes('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n')
  const end = bytes(`${tail}\ntrailer << /Root 1 0 R >>\n%%EOF\n`)
  const padding = Buffer.alloc(Math.max(0, size - start.length - end.length), 0x20)
  padding[0] = 0x25
  return Buffer.concat([start, padding, end])
}

// Executables

export const ELF = bytes([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], new Uint8Array(8), u16(3), u16(0x3e), new Uint8Array(44))
export const PE = bytes('MZ', [0x90, 0], new Uint8Array(56), u32(0x40), 'PE', [0, 0], new Uint8Array(64))
const peHeader = (characteristics: number): Buffer => {
  const header = bytes('PE', [0, 0], u16(0x8664), u16(1), new Uint8Array(12), u16(0xf0), u16(characteristics), new Uint8Array(64))
  return bytes('MZ', [0x90, 0], new Uint8Array(56), u32(0x80), new Uint8Array(0x80 - 0x40), header)
}
export const PE_EXE = peHeader(0x0022)
export const PE_DLL = peHeader(0x2022)
export const MACHO = bytes([0xcf, 0xfa, 0xed, 0xfe], u32(0x01000007), u32(3), u32(2), new Uint8Array(48))
export const MACHO_FAT = bytes([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2], new Uint8Array(40))
export const JAVA_CLASS = bytes([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0x41], [0, 0x10], new Uint8Array(40))
export const PYC = bytes(u16(3531), [0x0d, 0x0a], u32(0), u32(0x65000000), u32(120), [0xe3], new Uint8Array(40))
export const WASM = bytes([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0], new Uint8Array(16))
export const DEX = bytes('dex\n035\0', new Uint8Array(104))

// Fonts, 3D models, diagrams

export const WOFF = bytes('wOFF', [0, 1, 0, 0], u32(0x400), new Uint8Array(32))
export const WOFF2 = bytes('wOF2', [0, 1, 0, 0], u32(0x400), new Uint8Array(32))
export const TTF = bytes([0, 1, 0, 0, 0, 10, 0, 0x80, 0, 3, 0, 0x20], 'cmap', new Uint8Array(32))
export const OTF = bytes('OTTO', [0, 10, 0, 0x80, 0, 3, 0, 0x20], 'CFF ', new Uint8Array(32))

const gltfJson = '{"asset":{"version":"2.0","generator":"fixture"},"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0}],"meshes":[]}'
export const GLTF = Buffer.from(gltfJson)
const chunk = Buffer.from(gltfJson.padEnd(Math.ceil(gltfJson.length / 4) * 4, ' '))
export const GLB = bytes('glTF', u32(2), u32(12 + 8 + chunk.length), u32(chunk.length), 'JSON', chunk)
export const STL_ASCII = Buffer.from('solid cube\n facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 1 0 0\n   vertex 0 1 0\n'
  + '  endloop\n endfacet\nendsolid cube\n')
export const STL_BINARY = bytes(Buffer.alloc(80, 0x41), u32(2), Buffer.alloc(100, 1))
export const OBJ = Buffer.from('# cube\nv 0.0 0.0 0.0\nv 1.0 0.0 0.0\nv 0.0 1.0 0.0\nvn 0 0 1\nf 1 2 3\n')
export const FBX = bytes('Kaydara FBX Binary  \0', [0x1a, 0x00], u32(7400), new Uint8Array(32))
export const SOLID_PROSE = Buffer.from('solid foundations make a lasting house.\nThat is the whole note.\n')

export const DRAWIO = Buffer.from('<mxfile host="app.diagrams.net" version="24.0.0"><diagram id="a" name="Page-1"><mxGraphModel>'
  + '<root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>')
export const DRAWIO_PROLOG = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n${DRAWIO.toString()}`)
export const DRAWIO_SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" content="&lt;mxfile host=&quot;app.diagrams.net&quot;&gt;'
  + '&lt;diagram&gt;&lt;/diagram&gt;&lt;/mxfile&gt;"><rect width="1" height="1"/></svg>')
export const EXCALIDRAW = Buffer.from('{"type":"excalidraw","version":2,"source":"https://excalidraw.com","elements":[],"appState":{}}')

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (data: Uint8Array): number => {
  let c = 0xffffffff
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
/** The 1×1 PNG with a text chunk after its header, as draw.io writes its model into an exported png. */
export const pngWithText = (keyword: string, text: string): Buffer => {
  const data = bytes(keyword, [0], text)
  const typed = bytes('tEXt', data)
  const crc = crc32(typed)
  const textChunk = bytes([data.length >>> 24, (data.length >>> 16) & 0xff, (data.length >>> 8) & 0xff, data.length & 0xff], typed,
    [crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff])
  return Buffer.concat([PNG.subarray(0, 33), textChunk, PNG.subarray(33)])
}

// Containers

export interface ZipEntrySpec {
  name: string
  data: Uint8Array | string
  compress?: boolean
}

/** A zip built in memory with yazl. */
export const zipOf = async (entries: ZipEntrySpec[]): Promise<Buffer> => {
  const zip = new yazl.ZipFile()
  for (const entry of entries) {
    zip.addBuffer(Buffer.from(entry.data), entry.name, { compress: entry.compress ?? true, mtime: new Date('2026-01-01T00:00:00Z') })
  }
  zip.end()
  const chunks: Buffer[] = []
  for await (const piece of zip.outputStream as Readable) {
    chunks.push(piece as Buffer)
  }
  return Buffer.concat(chunks)
}

const contentTypes = (part: string, type: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + `<Default Extension="xml" ContentType="application/xml"/><Override PartName="${part}" ContentType="${type}"/></Types>`

export const docxOf = async (): Promise<Buffer> => await zipOf([
  { name: '[Content_Types].xml', data: contentTypes('/word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') },
  { name: 'word/document.xml', data: '<w:document/>' },
])
export const xlsxOf = async (): Promise<Buffer> => await zipOf([
  { name: '[Content_Types].xml', data: contentTypes('/xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml') },
  { name: 'xl/workbook.xml', data: '<workbook/>' },
])
export const pptxOf = async (): Promise<Buffer> => await zipOf([
  { name: '[Content_Types].xml', data: contentTypes('/ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml') },
  { name: 'ppt/presentation.xml', data: '<presentation/>' },
])
export const odtOf = async (): Promise<Buffer> => await zipOf([
  { name: 'mimetype', data: 'application/vnd.oasis.opendocument.text', compress: false },
  { name: 'content.xml', data: '<office:document-content/>' },
])

/** A docx whose markers sit behind a large stored entry — detectable only by seeking. */
export const bigDocxOf = async (padding: number): Promise<Buffer> => await zipOf([
  { name: 'padding.bin', data: Buffer.alloc(padding, 7), compress: false },
  { name: '[Content_Types].xml', data: contentTypes('/word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') },
  { name: 'word/document.xml', data: '<w:document/>' },
])

const guid = (text: string): Buffer => {
  const raw = Buffer.from(text.replace(/-/g, ''), 'hex')
  return Buffer.concat([Buffer.from(raw.subarray(0, 4)).reverse(), Buffer.from(raw.subarray(4, 6)).reverse(), Buffer.from(raw.subarray(6, 8)).reverse(), raw.subarray(8)])
}

export const CLSID = {
  doc: '00020906-0000-0000-c000-000000000046',
  xls: '00020820-0000-0000-c000-000000000046',
  ppt: '64818d10-4f9b-11cf-86ea-00aa00b929e8',
} as const

/** A minimal compound file: header, FAT sector, a directory whose root entry carries `clsid`. */
export const cfbOf = (clsid: string, directorySector = 1, sectors = 3): Buffer => {
  const file = Buffer.alloc(512 * (sectors + 1))
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(file, 0)
  file.writeUInt16LE(0x3e, 24)
  file.writeUInt16LE(3, 26)
  file.writeUInt16LE(0xfffe, 28)
  file.writeUInt16LE(9, 30)
  file.writeUInt16LE(6, 32)
  file.writeUInt32LE(1, 44)
  file.writeUInt32LE(directorySector, 48)
  file.writeUInt32LE(4096, 56)
  file.writeUInt32LE(0xfffffffe, 60)
  file.writeUInt32LE(0xfffffffe, 68)
  file.writeUInt32LE(0, 76)
  for (let index = 1; index < 109; index++) file.writeUInt32LE(0xffffffff, 76 + index * 4)
  const fat = 512
  file.writeUInt32LE(0xfffffffd, fat)
  for (let index = 1; index < 128; index++) file.writeUInt32LE(0xffffffff, fat + index * 4)
  file.writeUInt32LE(0xfffffffe, fat + directorySector * 4)
  const directory = 512 + directorySector * 512
  Buffer.from('Root Entry', 'utf16le').copy(file, directory)
  file.writeUInt16LE(22, directory + 64)
  file[directory + 66] = 5
  guid(clsid).copy(file, directory + 80)
  return file
}

/** A tar built in memory with tar-stream. */
export const tarOf = async (entries: Array<{ name: string, data: string }>): Promise<Buffer> => {
  const pack = tarStream.pack()
  const done = (async () => {
    const chunks: Buffer[] = []
    for await (const piece of pack) chunks.push(Buffer.from(piece as Uint8Array))
    return Buffer.concat(chunks)
  })()
  for (const entry of entries) {
    const data = Buffer.from(entry.data)
    await new Promise<void>((resolve, reject) => {
      pack.entry({ name: entry.name, size: data.length }, data, error => error != null ? reject(error) : resolve())
    })
  }
  pack.finalize()
  return await done
}
