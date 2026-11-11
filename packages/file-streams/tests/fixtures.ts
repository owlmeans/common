import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import tarStream from 'tar-stream'
import yazl from 'yazl'

const bytes = (...parts: Array<number[] | string | Uint8Array>): Buffer => Buffer.concat(parts.map(part =>
  typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part)))

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
export const ELF = bytes([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], new Uint8Array(56))
export const PE = bytes('MZ', [0x90, 0], new Uint8Array(56), [0x40, 0, 0, 0], 'PE', [0, 0], new Uint8Array(64))

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

export interface ZipEntrySpec {
  name: string
  data: Uint8Array | string
  compress?: boolean
  mode?: number
}

/** A zip built in memory with yazl. */
export const zipOf = async (entries: ZipEntrySpec[]): Promise<Buffer> => {
  const zip = new yazl.ZipFile()
  for (const entry of entries) {
    zip.addBuffer(Buffer.from(entry.data), entry.name, {
      compress: entry.compress ?? true, mtime: new Date('2026-01-01T00:00:00Z'), ...(entry.mode != null ? { mode: entry.mode } : {}),
    })
  }
  zip.end()
  const chunks: Buffer[] = []
  for await (const chunk of zip.outputStream as Readable) {
    chunks.push(chunk as Buffer)
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
  const hex = text.replace(/-/g, '')
  const raw = Buffer.from(hex, 'hex')
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

export interface TarEntrySpec {
  name: string
  data?: Uint8Array | string
  type?: 'file' | 'directory' | 'symlink' | 'link'
  linkname?: string
}

/** A tar built in memory with tar-stream. */
export const tarOf = async (entries: TarEntrySpec[]): Promise<Buffer> => {
  const pack = tarStream.pack()
  const done = (async () => {
    const chunks: Buffer[] = []
    for await (const chunk of pack) chunks.push(Buffer.from(chunk as Uint8Array))
    return Buffer.concat(chunks)
  })()
  for (const entry of entries) {
    const data = entry.data != null ? Buffer.from(entry.data) : Buffer.alloc(0)
    await new Promise<void>((resolve, reject) => {
      pack.entry({ name: entry.name, type: entry.type ?? 'file', linkname: entry.linkname, size: entry.type == null || entry.type === 'file' ? data.length : 0 },
        entry.type == null || entry.type === 'file' ? data : undefined as unknown as Buffer, error => error != null ? reject(error) : resolve())
    })
  }
  pack.finalize()
  return await done
}

export const tgzOf = async (entries: TarEntrySpec[]): Promise<Buffer> => gzipSync(await tarOf(entries))

/** Replaces every occurrence of one same-length byte string — to plant names a writer would refuse. */
export const patch = (buffer: Buffer, from: string, to: string): Buffer => {
  if (from.length !== to.length) throw new Error('patch needs equal lengths')
  const out = Buffer.from(buffer)
  let index = out.indexOf(from)
  while (index !== -1) {
    out.write(to, index, 'latin1')
    index = out.indexOf(from, index + 1)
  }
  return out
}

/** Offsets of zip central-directory records. */
export const centralRecords = (zip: Buffer): number[] => {
  const offsets: number[] = []
  let index = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  while (index !== -1) {
    offsets.push(index)
    index = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), index + 4)
  }
  return offsets
}

/** Deterministic pseudo-random bytes. */
export const noise = (length: number, seed = 1): Buffer => {
  const out = Buffer.alloc(length)
  let state = seed >>> 0
  for (let index = 0; index < length; index++) {
    state = (state * 1664525 + 1013904223) >>> 0
    out[index] = state >>> 24
  }
  return out
}
