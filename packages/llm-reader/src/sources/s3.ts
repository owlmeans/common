import { logger } from '@owlmeans/log'
import { ReaderFetchError } from '../errors.js'
import type { ReaderSource, ReaderSourceContext, SourceAnswer, SourceEntry } from '../collect/types.js'
import { DEFAULT_S3_MAX_PAGES, DEFAULT_S3_PAGE_SIZE, S3_HEADER_PREFIXES, S3_SOURCE } from './s3/consts.js'
import type { S3Location, S3SourceOptions } from './s3/types.js'
import { createS3UrlHelper } from './s3/url.js'
import { s3XmlHelper } from './s3/xml.js'

const log = logger('llm-reader:s3')

/** The last segment of a key — the object's own name. */
const baseName = (key: string): string => key.split('/').filter(part => part !== '').pop() ?? key

/**
 * Public S3 as a reader source — anonymous requests only, through the reader's guarded fetch (never an
 * AWS SDK): an object link is one file; a prefix (a trailing `/`, a listing link, or a key that lists
 * children) is every object under it from ListObjectsV2, each keeping its key path relative to the
 * prefix. An object whose prefix may not be listed is still downloaded. `s3://`, AWS virtual-hosted
 * and path-style URLs and the configured endpoints match by URL; any other S3-compatible endpoint is
 * recognised from its answer (a listing, an S3 error document for a folder link, `x-amz-*` headers).
 */
export const createS3Source = (options: S3SourceOptions = {}): ReaderSource => {
  const urls = createS3UrlHelper(options)
  const pageSize = Math.min(options.pageSize ?? DEFAULT_S3_PAGE_SIZE, DEFAULT_S3_PAGE_SIZE)
  const maxPages = options.maxPages ?? DEFAULT_S3_MAX_PAGES

  const matches: ReaderSource['matches'] = url => urls.parse(url) != null

  const s3Headers = (headers: Record<string, string>): boolean =>
    Object.keys(headers).some(name => S3_HEADER_PREFIXES.some(prefix => name.toLowerCase().startsWith(prefix)))

  const recognizes: NonNullable<ReaderSource['recognizes']> = async (answer: SourceAnswer) => {
    const xmlish = answer.contentType === '' || /xml/.test(answer.contentType)
    if (answer.status === 200 && xmlish && s3XmlHelper.listing(await answer.peek()) != null) return true
    const url = new URL(answer.finalUrl)
    // Only a folder-shaped link is taken from an error: an object's error stays that object's failure.
    if (!url.pathname.endsWith('/') && !url.searchParams.has('list-type')) return false
    if ((answer.status === 403 || answer.status === 404) && xmlish && s3XmlHelper.error(await answer.peek()) != null) return true
    return s3Headers(answer.headers) && (answer.status === 403 || answer.status === 404 || (answer.status === 200 && answer.headers['content-length'] === '0'))
  }

  /**
   * Every object under `prefix`, as entries relative to the prefix's folder — `undefined` when the
   * listing is refused and `strict` is off.
   */
  const list = async (location: S3Location, prefix: string, context: ReaderSourceContext, strict: boolean): Promise<SourceEntry[] | undefined> => {
    const folder = prefix.slice(0, prefix.lastIndexOf('/') + 1)
    const wanted = context.limits.maxFiles + 1 // one over the limit, so the collect reports the cut
    const entries: SourceEntry[] = []
    let token: string | undefined
    for (let page = 0; page < maxPages && entries.length < wanted; page++) {
      const response = await context.fetch(urls.listUrl(location, prefix, { maxKeys: pageSize, ...(token != null ? { token } : {}) }))
      const text = await response.text()
      const listing = response.ok ? s3XmlHelper.listing(text) : undefined
      if (listing == null) {
        if (page > 0 || !strict) return page > 0 ? entries : undefined
        const code = s3XmlHelper.error(text)?.code
        throw Object.assign(new ReaderFetchError(`s3:listing-${response.status}${code != null ? `:${code}` : ''}`), { status: response.status })
      }
      for (const object of listing.objects) {
        // Folder markers are zero-byte keys ending in `/`; the prefix itself is not a file in it.
        if (object.key.endsWith('/') || object.key === prefix || !object.key.startsWith(folder)) continue
        entries.push({ path: object.key.slice(folder.length), url: urls.objectUrl(location, object.key), name: baseName(object.key), ...(object.size != null ? { size: object.size } : {}) })
        if (entries.length >= wanted) break
      }
      if (!listing.truncated || listing.token == null) break
      token = listing.token
    }
    log.debug('Listed', { bucket: location.bucket, entries: entries.length })
    return entries
  }

  const expand: ReaderSource['expand'] = async (url, context) => {
    const location = urls.parse(url) ?? urls.generic(url)
    if (location == null) throw new ReaderFetchError('s3:not-a-location')
    if (location.key === '' || location.key.endsWith('/') || location.listing) {
      return (await list(location, location.key, context, true))!
    }
    // A key without a trailing slash is an object — unless it lists children.
    const children = await list(location, `${location.key}/`, context, false).catch(() => undefined)
    if (children != null && children.length > 0) return children
    return [{ path: baseName(location.key), url: urls.objectUrl(location, location.key), name: baseName(location.key) }]
  }

  return { name: S3_SOURCE, matches, recognizes, expand }
}
