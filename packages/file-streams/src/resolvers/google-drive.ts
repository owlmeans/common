import { logger } from '@owlmeans/log'
import { ResolverError } from '../errors.js'
import type { ResolverBodyReader, ResolverResponseHead, ResolverStep, UrlResolver } from './types.js'
import {
  DEFAULT_DRIVE_PAGE_BYTES, DEFAULT_EXPORT_FORMATS, DEFAULT_GOOGLE_ORIGINS, DRIVE_ID_PATTERN, GOOGLE_DRIVE_RESOLVER, MAX_DRIVE_STEPS,
} from './google-drive/consts.js'
import type { GoogleDriveResolverOptions } from './google-drive/types.js'

const log = logger('file-streams:drive')

/**
 * Google Drive and Docs links to the bytes behind them: share links become the usercontent
 * download, the "can't scan for viruses" page is followed through its own form, and editor files
 * become export URLs in the configured formats. Folders, quotas and non-public files fail.
 */
export const createGoogleDriveResolver = (options: GoogleDriveResolverOptions = {}): UrlResolver => {
  const origins = { ...DEFAULT_GOOGLE_ORIGINS, ...options.origins }
  const drive = new URL(origins.drive).origin
  const usercontent = new URL(origins.usercontent).origin
  const docs = new URL(origins.docs).origin
  const accounts = new URL(origins.accounts).origin
  const formats = { ...DEFAULT_EXPORT_FORMATS, ...options.exports }
  const maxPageBytes = options.maxPageBytes ?? DEFAULT_DRIVE_PAGE_BYTES

  const owns = (url: URL): boolean => url.origin === drive || url.origin === usercontent || url.origin === docs

  const matches = owns

  const fail = (reason: string): ResolverError => new ResolverError(`${GOOGLE_DRIVE_RESOLVER}:${reason}`)

  const exportOf = (url: URL): URL | undefined => {
    const match = /^\/(document|spreadsheets|presentation|drawings)\/d\/([^/]+)/.exec(url.pathname)
    if (match == null || !DRIVE_ID_PATTERN.test(match[2])) {
      return undefined
    }
    const [, type, id] = match
    switch (type) {
      case 'document':
        return new URL(`/document/d/${id}/export?format=${formats.document}`, docs)
      case 'spreadsheets': {
        const exported = new URL(`/spreadsheets/d/${id}/export?format=${formats.spreadsheet}`, docs)
        const gid = url.searchParams.get('gid') ?? /gid=(\d+)/.exec(url.hash)?.[1]
        if (gid != null && (formats.spreadsheet === 'csv' || formats.spreadsheet === 'tsv')) {
          exported.searchParams.set('gid', gid)
        }
        return exported
      }
      case 'presentation':
        return new URL(`/presentation/d/${id}/export/${formats.presentation}`, docs)
      default:
        return new URL(`/drawings/d/${id}/export/${formats.drawing}`, docs)
    }
  }

  const rewrite = (url: URL): URL => {
    if (url.origin === docs) {
      const exported = exportOf(url)
      if (exported != null) {
        return exported
      }
    }
    if (url.origin === drive) {
      if (/\/drive\/(u\/\d+\/)?folders\//.test(url.pathname) || url.pathname.startsWith('/embeddedfolderview')) {
        throw fail('folder')
      }
      const id = /\/file\/d\/([^/]+)/.exec(url.pathname)?.[1] ?? url.searchParams.get('id')
      if (id == null || !DRIVE_ID_PATTERN.test(id)) {
        return url
      }
      const download = new URL('/download', usercontent)
      download.searchParams.set('id', id)
      download.searchParams.set('export', 'download')
      const resourceKey = url.searchParams.get('resourcekey')
      if (resourceKey != null) {
        download.searchParams.set('resourcekey', resourceKey)
      }
      return download
    }

    return url
  }

  const decodeHtml = (value: string): string => value
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

  const attribute = (tag: string, name: string): string | undefined =>
    new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(2).find(value => value != null)

  const headerOf = (head: ResolverResponseHead, name: string): string[] => {
    const value = head.headers[name]
    return value == null ? [] : Array.isArray(value) ? value : [value]
  }

  const inspect = async (head: ResolverResponseHead, readBody: ResolverBodyReader): Promise<ResolverStep> => {
    if (head.url.origin === accounts) {
      return { action: 'fail', reason: 'not-public' }
    }
    const type = headerOf(head, 'content-type')[0]?.toLowerCase() ?? ''
    const disposition = headerOf(head, 'content-disposition')[0]?.toLowerCase() ?? ''
    if (disposition.includes('attachment') || !type.includes('text/html')) {
      return { action: 'accept' }
    }

    const page = await readBody(maxPageBytes)
    const formTag = /<form\b[^>]*\bid\s*=\s*["']download-form["'][^>]*>/i.exec(page)
    if (formTag != null) {
      const action = attribute(formTag[0], 'action')
      if (action != null) {
        const next = new URL(decodeHtml(action), head.url)
        if (!owns(next)) {
          return { action: 'fail', reason: 'foreign-form' }
        }
        const body = page.slice(formTag.index, page.indexOf('</form>', formTag.index) === -1 ? undefined : page.indexOf('</form>', formTag.index))
        for (const input of body.match(/<input\b[^>]*>/gi) ?? []) {
          const name = attribute(input, 'name')
          if (name != null && (attribute(input, 'type') ?? '').toLowerCase() === 'hidden') {
            next.searchParams.set(name, decodeHtml(attribute(input, 'value') ?? ''))
          }
        }
        log.debug('Following the Drive confirmation form')
        return { action: 'follow', url: next }
      }
    }

    const legacy = /href\s*=\s*"(\/uc\?export=download[^"]*confirm=[^"]+)"/i.exec(page)
    if (legacy != null) {
      return { action: 'follow', url: new URL(decodeHtml(legacy[1]), head.url) }
    }

    const warning = headerOf(head, 'set-cookie').map(cookie => /^(download_warning[^=]*)=([^;]+)/.exec(cookie)).find(match => match != null)
    if (warning != null) {
      const next = new URL(head.url)
      next.searchParams.set('confirm', warning[2])
      return { action: 'follow', url: next, headers: { cookie: `${warning[1]}=${warning[2]}` } }
    }

    if (/quota|too many users have viewed or downloaded/i.test(page)) {
      return { action: 'fail', reason: 'quota' }
    }
    if (/too large to be exported/i.test(page)) {
      return { action: 'fail', reason: 'export-too-large' }
    }
    if (/accounts\.google\.com\/(ServiceLogin|v3\/signin)|you need access|request access/i.test(page)) {
      return { action: 'fail', reason: 'not-public' }
    }

    return { action: 'fail', reason: 'unrecognized' }
  }

  return { name: GOOGLE_DRIVE_RESOLVER, maxSteps: MAX_DRIVE_STEPS, matches, rewrite, inspect, owns }
}

export const googleDriveResolver = createGoogleDriveResolver()
