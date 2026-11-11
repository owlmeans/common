import { FileKind } from '../consts.js'
import { CODE_LANGUAGE_BY_EXT, SHEBANG_LANGUAGES } from './consts.js'
import type { TextFinding, TextSniffer } from './types.local.js'

/** What a sample is as text: encoding, then html / json / csv / code / plain. */
export const createTextSniffer = (): TextSniffer => {
  const decodeUtf8 = (bytes: Uint8Array, complete: boolean): string | undefined => {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    for (let cut = 0; cut <= (complete ? 0 : 3) && cut < bytes.length + 1; cut++) {
      try {
        return decoder.decode(bytes.subarray(0, bytes.length - cut))
      } catch {
        // a multi-byte sequence the sample cut in half — retry without its tail
      }
    }

    return undefined
  }

  const decode = (bytes: Uint8Array, complete: boolean): { text?: string, encoding: TextFinding['encoding'] } => {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return { text: decodeUtf8(bytes.subarray(3), complete), encoding: 'utf-8' }
    }
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2, bytes.length - (bytes.length % 2))), encoding: 'utf-16le' }
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2, bytes.length - (bytes.length % 2))), encoding: 'utf-16be' }
    }
    if (bytes.includes(0)) {
      return { encoding: 'binary' }
    }

    const text = decodeUtf8(bytes, complete)
    return text != null ? { text, encoding: 'utf-8' } : { encoding: 'binary' }
  }

  const controlRatio = (text: string): number => {
    let control = 0
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index)
      if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d && code !== 0x0c) || code === 0x7f) {
        control++
      }
    }

    return text.length === 0 ? 0 : control / text.length
  }

  const activeMarkup = (text: string): boolean =>
    /<script[\s>/]|\son[a-z]+\s*=|javascript:|<foreignObject[\s>]|<iframe[\s>]|<embed[\s>]|<object[\s>]/i.test(text)

  const csvOf = (text: string, complete: boolean): TextFinding['csv'] => {
    const lines = text.split(/\r?\n/)
    if (!complete && lines.length > 1) {
      lines.pop()
    }
    const sample = lines.filter(line => line.trim() !== '').slice(0, 20).map(line => line.replace(/"(?:[^"]|"")*"/g, '""'))
    if (sample.length < 2) {
      return undefined
    }
    let best: TextFinding['csv']
    for (const delimiter of [',', '\t', ';', '|']) {
      const counts = sample.map(line => line.split(delimiter).length - 1)
      if (counts[0] > 0 && counts.every(count => count === counts[0]) && (best == null || counts[0] + 1 > best.columns)) {
        best = { delimiter, columns: counts[0] + 1 }
      }
    }

    return best
  }

  const jsonLike = (text: string, complete: boolean): boolean => {
    const trimmed = text.trim()
    if (!/^[[{]/.test(trimmed)) {
      return false
    }
    if (complete) {
      try {
        JSON.parse(trimmed)
        return true
      } catch {
        return false
      }
    }

    return /^\{\s*("|\})|^\[\s*([[{"\]\d-]|true|false|null)/.test(trimmed)
  }

  /** Formats carried in JSON: an Excalidraw scene, a glTF model (its `asset.version`, or a `.gltf` claim on a cut sample). */
  const jsonFormat = (text: string, complete: boolean, ext?: string): Partial<TextFinding> | undefined => {
    const sample = text.slice(0, 16384)
    if (/"type"\s*:\s*"excalidraw"/.test(sample)) {
      return { kind: FileKind.Diagram, ext: 'excalidraw', mime: 'application/vnd.excalidraw+json', confidence: 'medium' }
    }
    const asset = /"asset"\s*:\s*\{[^{}]*"version"\s*:\s*"[12]\.\d+"/.test(sample)
    if (asset && (ext === 'gltf' || /"(scenes|nodes|meshes|accessors|bufferViews|buffers)"\s*:/.test(sample))) {
      return { kind: FileKind.Model3d, ext: 'gltf', mime: 'model/gltf+json', confidence: 'medium' }
    }
    if (ext === 'gltf' && !complete && !asset) {
      return { kind: FileKind.Model3d, ext: 'gltf', mime: 'model/gltf+json', confidence: 'low' }
    }

    return undefined
  }

  /** 3D models written as text: an ASCII STL (`solid` … `facet normal`), an OBJ under its claim, an ASCII FBX. */
  const modelFormat = (head: string, complete: boolean, ext?: string): Partial<TextFinding> | undefined => {
    const sample = head.slice(0, 16384)
    if (/^solid(\s|$)/.test(sample) && /\bfacet\s+normal\b|\bendsolid\b/.test(sample)) {
      return { kind: FileKind.Model3d, ext: 'stl', mime: 'model/stl', confidence: 'medium' }
    }
    if (ext === 'obj' && /^v\s+[-+\d.]/m.test(sample) && (/^f\s+\d/m.test(sample) || !complete)) {
      return { kind: FileKind.Model3d, ext: 'obj', mime: 'model/obj', confidence: 'low' }
    }
    if (/^; FBX \d/.test(sample)) {
      return { kind: FileKind.Model3d, ext: 'fbx', mime: 'application/x-ft-fbx', confidence: 'medium' }
    }

    return undefined
  }

  const sniff = (bytes: Uint8Array, complete: boolean, ext?: string): TextFinding => {
    const { text, encoding } = decode(bytes, complete)
    if (text == null || controlRatio(text) > 0.01) {
      return { text: false, encoding: 'binary' }
    }
    const head = text.trimStart()
    const found: TextFinding = { text: true, encoding }

    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
      return { ...found, kind: FileKind.Image, ext: 'svg', mime: 'image/svg+xml', confidence: 'medium', active: activeMarkup(text) }
    }

    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(mxfile|mxGraphModel)[\s>]/.test(head)) {
      return { ...found, kind: FileKind.Diagram, ext: 'drawio', mime: 'application/vnd.jgraph.mxfile', confidence: 'medium' }
    }

    if (/^<!doctype html|^<html[\s>]|^<head[\s>]|^<body[\s>]/i.test(head)
      || (head.startsWith('<') && /<(head|body|div|meta|title|script)[\s>]/i.test(head.slice(0, 4096)) && !/^<\?xml|^<svg/i.test(head))) {
      return { ...found, kind: FileKind.Html, ext: 'html', mime: 'text/html', confidence: 'medium', active: activeMarkup(text) }
    }

    if (head.startsWith('#!')) {
      const line = head.slice(0, head.indexOf('\n') === -1 ? head.length : head.indexOf('\n'))
      const interpreter = line.split(/[\s/]+/).filter(part => part !== '' && part !== '#!' && part !== 'env' && !part.startsWith('-')).pop() ?? ''
      const language = SHEBANG_LANGUAGES[interpreter.replace(/[\d.]+$/, '')] ?? SHEBANG_LANGUAGES[interpreter] ?? 'shell'
      const scriptExt = ext != null && CODE_LANGUAGE_BY_EXT[ext] != null ? ext : 'sh'
      return { ...found, kind: FileKind.Code, ext: scriptExt, mime: 'text/x-script', confidence: 'medium', language, shebang: true }
    }

    if (ext != null && CODE_LANGUAGE_BY_EXT[ext] != null) {
      return { ...found, kind: FileKind.Code, ext, mime: 'text/plain', confidence: 'low', language: CODE_LANGUAGE_BY_EXT[ext] }
    }

    if (jsonLike(text, complete)) {
      const format = jsonFormat(text, complete, ext)
      return format != null
        ? { ...found, ...format }
        : { ...found, kind: FileKind.Text, ext: 'json', mime: 'application/json', confidence: complete ? 'medium' : 'low' }
    }

    const model = modelFormat(head, complete, ext)
    if (model != null) {
      return { ...found, ...model }
    }

    const csv = csvOf(text, complete)
    if (csv != null && (ext === 'csv' || ext === 'tsv' || text.split(/\r?\n/).filter(line => line.trim() !== '').length >= 3)) {
      const tsv = csv.delimiter === '\t'
      return {
        ...found, kind: FileKind.Csv, ext: tsv ? 'tsv' : 'csv', mime: tsv ? 'text/tab-separated-values' : 'text/csv',
        confidence: 'low', csv,
      }
    }

    if (/^\s*(import\s.+from\s|export\s+(default|const|function|class|interface|type)\b|package\s+[\w.]+;|#include\s*[<"]|using\s+[\w.]+;|def\s+\w+\(|function\s+\w+\s*\()/m.test(text.slice(0, 8192))) {
      return { ...found, kind: FileKind.Code, ext: ext ?? 'txt', mime: 'text/plain', confidence: 'low' }
    }

    return { ...found, kind: FileKind.Text, ext: 'txt', mime: 'text/plain', confidence: 'low' }
  }

  const isActive = (bytes: Uint8Array): boolean => {
    const { text } = decode(bytes, false)
    return text != null && activeMarkup(text)
  }

  return { sniff, isActive }
}
