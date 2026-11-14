import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { CollectRole } from '../consts.js'
import { BUNDLE_EXTERNAL_DIR } from './consts.js'
import { EXTENSION_BY_MIME, FALLBACK_FILE_NAME, MAX_SEGMENT_LENGTH } from './consts.local.js'
import type { CollectPaths } from './types.local.js'

const decode = (text: string): string => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

export const createCollectPaths = (): CollectPaths => {
  const extensionOf = (path: string): string => {
    const last = path.split('/').pop() ?? ''
    const dot = last.lastIndexOf('.')
    return dot > 0 && dot < last.length - 1 ? last.slice(dot + 1).toLowerCase() : ''
  }

  const segment = (text: string): string => {
    // Control, bidi and reserved characters would make a name misleading or unstorable.
    let clean = text.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"|?*\\/\u202a-\u202e\u2066-\u2069]/g, '_').trim()
    if (clean === '' || clean === '.' || clean === '..') clean = '_'
    if (clean.length > MAX_SEGMENT_LENGTH) {
      const ext = extensionOf(clean)
      const keep = ext.length > 0 && ext.length < 12 ? `.${ext}` : ''
      clean = `${clean.slice(0, MAX_SEGMENT_LENGTH - keep.length)}${keep}`
    }
    return clean
  }

  const safe = (path: string): string | undefined => {
    if (path.startsWith('/') || path.includes('\\') || path.includes('\0') || /^[a-zA-Z]:/.test(path)) return undefined
    const segments = path.split('/').filter(part => part !== '' && part !== '.')
    if (segments.length === 0 || segments.some(part => part === '..')) return undefined
    return segments.join('/')
  }

  const join = (...parts: Array<string | undefined>): string =>
    parts.filter((part): part is string => part != null && part !== '').join('/')

  const withExtension = (name: string, mime: string | undefined, fallback: string): string =>
    extensionOf(name) !== '' ? name : `${name}.${(mime != null ? EXTENSION_BY_MIME[mime] : undefined) ?? fallback}`

  /** A query string folded into the name, so `css2?family=A` and `css2?family=B` do not collide. */
  const withQuery = (name: string, search: string): string => {
    if (search === '' || search === '?') return name
    const hash = createHash('sha256').update(search).digest('hex').slice(0, 8)
    const ext = extensionOf(name)
    return ext !== '' ? `${name.slice(0, -(ext.length + 1))}-${hash}.${ext}` : `${name}-${hash}`
  }

  /** The URL path as sanitized segments and its last raw part (`''` for a directory URL). */
  const partsOf = (url: URL): { dirs: string[], last: string } => {
    const raw = url.pathname.split('/').slice(1).map(decode)
    const last = raw.pop() ?? ''
    return { dirs: raw.filter(part => part !== '').map(segment), last }
  }

  const entryOf = (url: string): string => {
    const parsed = new URL(url)
    const { dirs, last } = partsOf(parsed)
    const name = last === ''
      ? 'index.html'
      : ['html', 'htm', 'xhtml'].includes(extensionOf(last)) ? segment(last) : `${segment(last)}.html`
    return join(...dirs, withQuery(name, parsed.search))
  }

  const fallbackExtension = (role: CollectRole | undefined): string =>
    role === CollectRole.Stylesheet ? 'css' : role === CollectRole.Page ? 'html' : 'bin'

  const assetOf = (url: string, pageOrigin: string, mime?: string, role?: CollectRole): string => {
    const parsed = new URL(url)
    const { dirs, last } = partsOf(parsed)
    const name = withQuery(withExtension(last === '' ? 'index' : segment(last), mime, fallbackExtension(role)), parsed.search)
    const base = parsed.origin === pageOrigin ? dirs : [BUNDLE_EXTERNAL_DIR, segment(parsed.host.replace(':', '_')), ...dirs]
    return join(...base, name)
  }

  const relative = (from: string, to: string): string => {
    const path = posix.relative(posix.dirname(`/${from}`), `/${to}`)
    // `@`, `!`, `$`, `+`, `=` are fine in a path; `,` stays encoded (it would split a srcset), `:` too (it would read as a scheme).
    return path.split('/').map(part => part === '..' ? part : encodeURIComponent(part).replace(/%(40|21|24|2B|3D)/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))).join('/')
  }

  const fromDisposition = (disposition: string | undefined): string | undefined => {
    if (disposition == null) return undefined
    const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(disposition)
    if (extended != null) {
      const value = decode(extended[2]!.trim().replace(/^"|"$/g, ''))
      if (value !== '') return value
    }
    const plain = /filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]+))/i.exec(disposition)
    const value = plain?.[1]?.replace(/\\(.)/g, '$1') ?? plain?.[2]?.trim()
    return value != null && value !== '' ? value : undefined
  }

  const nameOf = (disposition: string | undefined, url: string, mime?: string): string => {
    const declared = fromDisposition(disposition)
    // A declared name may carry a path; only its last part names the file.
    const fromHeader = declared?.split(/[\\/]/).pop()
    let fromUrl: string | undefined
    try {
      fromUrl = decode(new URL(url).pathname.split('/').pop() ?? '')
    } catch {
      fromUrl = undefined
    }
    const chosen = [fromHeader, fromUrl].find(name => name != null && name.trim() !== '' && name !== '.' && name !== '..')
    return segment(withExtension(chosen ?? FALLBACK_FILE_NAME, mime, 'bin'))
  }

  return { safe, join, segment, entryOf, assetOf, relative, nameOf, extensionOf }
}

export const collectPaths = createCollectPaths()
