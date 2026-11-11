import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { ReaderContentError, ReaderRefusedError } from '../errors.js'
import { textUtils } from '../utils/text.js'
import { BUNDLE_CONTENT_TYPES, BUNDLE_FALLBACK_TYPE, BUNDLE_INDEX, DEFAULT_BUNDLE_ORIGIN } from './bundle/consts.js'
import type { LocalBundleFile, LocalBundleOptions, LocalBundlePlugin } from './bundle/types.js'
import { DEFAULT_MAX_BYTES, TEXT_TYPES } from './fetcher/consts.js'
import type { FetchedResource } from './fetcher/types.js'

/** A path segment that could leave its directory or name something else than one file. */
const unsafe = (segment: string): boolean =>
  segment === '.' || segment === '..' || /[\\/\0]/.test(segment)

/**
 * Serve a local directory — an uploaded page prototype — to the reader under a synthetic origin, so
 * `page`, `describe`, `design`, `images` and `extract` read `https://bundle.local/home.html` and its
 * stylesheets and pictures from disk. Every other URL goes on down the plugin chain untouched.
 */
export const createLocalBundlePlugin = (options: LocalBundleOptions): LocalBundlePlugin => {
  const origin = new URL(options.origin ?? DEFAULT_BUNDLE_ORIGIN).origin
  let rootOf: Promise<string> | undefined
  /** The root as the file system resolves it — symbolic links in its own path included. */
  const root = (): Promise<string> => rootOf ??= realpath(resolve(options.root))

  const serves = (url: string): boolean => {
    try {
      return new URL(url).origin === origin
    } catch {
      return false
    }
  }

  const urlOf = (path: string): string => {
    if (isAbsolute(path) || /^[a-zA-Z]:/.test(path) || path.startsWith('\\')) {
      throw new ReaderRefusedError(`bundle-absolute:${path}`)
    }
    const segments = path.split(/[\\/]/).filter(segment => segment !== '' && segment !== '.')
    if (segments.some(unsafe)) throw new ReaderRefusedError(`bundle-path:${path}`)
    return `${origin}/${segments.map(encodeURIComponent).join('/')}`
  }

  /** The path segments of a bundle URL, decoded — refused when any could leave its directory. */
  const segmentsOf = (url: string): string[] => {
    const { pathname } = new URL(url)
    return pathname.split('/').filter(segment => segment !== '').map(segment => {
      let decoded: string
      try {
        decoded = decodeURIComponent(segment)
      } catch {
        throw new ReaderRefusedError(`bundle-path:${pathname}`)
      }
      if (unsafe(decoded)) throw new ReaderRefusedError(`bundle-path:${pathname}`)
      return decoded
    })
  }

  /** The real path of `target`, confined to the root; `null` when nothing is there. */
  const confined = async (base: string, target: string): Promise<string | null> => {
    let real: string
    try {
      real = await realpath(target)
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === 'ENOENT' || code === 'ENOTDIR') return null
      throw e
    }
    if (real !== base && !real.startsWith(`${base}${sep}`)) {
      throw new ReaderRefusedError(`bundle-escape:${relative(base, target)}`)
    }
    return real
  }

  const read = async (url: string, maxBytes?: number): Promise<LocalBundleFile | null> => {
    if (!serves(url)) return null
    const base = await root()
    let real = await confined(base, join(base, ...segmentsOf(url)))
    if (real == null) return null
    let info = await stat(real)
    if (info.isDirectory()) {
      real = await confined(base, join(real, BUNDLE_INDEX))
      if (real == null) return null
      info = await stat(real)
    }
    if (!info.isFile()) return null
    if (maxBytes != null && info.size > maxBytes) throw new ReaderContentError(`too-large:${info.size}`)
    const extension = extname(real).slice(1).toLowerCase()

    return {
      path: relative(base, real).split(sep).join('/'),
      contentType: BUNDLE_CONTENT_TYPES[extension] ?? BUNDLE_FALLBACK_TYPE,
      bytes: new Uint8Array(await readFile(real)),
    }
  }

  const fetch: LocalBundlePlugin['fetch'] = async (request, next) => {
    if (!serves(request.url)) return next(request)
    const purpose = request.purpose ?? 'page'
    const file = await read(request.url, request.maxBytes ?? DEFAULT_MAX_BYTES[purpose])
    const answer = { url: request.url, finalUrl: request.url, fetchedAt: new Date().toISOString(), redirects: [] }
    if (file == null) {
      return { ...answer, status: 404, headers: { 'content-type': 'text/plain' }, contentType: 'text/plain', text: '', charset: 'utf-8' }
    }
    const { contentType, bytes } = file
    const textual = TEXT_TYPES.some(type => type.test(contentType))
    // The same refusals the network path makes, so a reader cannot tell the two apart.
    if (purpose === 'page' && !textual) throw new ReaderContentError(`unsupported-content-type:${contentType}`)
    if (purpose === 'image' && !contentType.startsWith('image/')) throw new ReaderContentError(`not-an-image:${contentType}`)
    const decoded = textual && purpose !== 'image' ? textUtils.decode(bytes, contentType) : undefined

    return {
      ...answer,
      status: 200,
      headers: { 'content-type': contentType, 'content-length': String(bytes.length) },
      contentType,
      ...(decoded != null ? { text: decoded.text, charset: decoded.charset } : { bytes }),
    } satisfies FetchedResource
  }

  return { name: 'local-bundle', origin, serves, urlOf, read, fetch }
}
