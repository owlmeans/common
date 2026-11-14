import { DEFAULT_S3_ENDPOINT, S3_PRESIGNED_PARAMS } from './consts.js'
import type { S3Location, S3SourceOptions, S3UrlHelper } from './types.js'

const decode = (text: string): string => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

const encodeKey = (key: string): string => key.split('/').map(encodeURIComponent).join('/')

export const createS3UrlHelper = (options: S3SourceOptions = {}): S3UrlHelper => {
  const endpoints = (options.endpoints ?? []).map(endpoint => new URL(endpoint).origin)

  /** A listing link names its prefix in the query. */
  const prefixOf = (url: URL): string | undefined =>
    url.searchParams.has('list-type') || url.searchParams.has('prefix') ? url.searchParams.get('prefix') ?? '' : undefined

  const pathStyle = (url: URL, endpoint: string, region?: string): S3Location | undefined => {
    const [bucket = '', ...rest] = url.pathname.split('/').slice(1)
    if (bucket === '') return undefined
    const prefix = prefixOf(url)
    return {
      endpoint, bucket: decode(bucket), key: prefix ?? rest.map(decode).join('/'), style: 'path', listing: prefix != null,
      ...(region != null ? { region } : {}),
    }
  }

  const amazon = (url: URL): S3Location | undefined => {
    const host = url.hostname.toLowerCase()
    if (!host.endsWith('.amazonaws.com') && !host.endsWith('.amazonaws.com.cn')) return undefined
    const labels = host.split('.')
    const at = labels.findIndex(label => label === 's3' || label.startsWith('s3-'))
    if (at < 0) return undefined
    const label = labels[at]!
    // A website endpoint serves pages, not the REST API.
    if (label.startsWith('s3-website') || labels[at + 1]?.startsWith('website') === true) return undefined
    const after = labels[at + 1] === 'dualstack' ? labels[at + 2] : labels[at + 1]
    const region = label.startsWith('s3-') && label !== 's3-accelerate' ? label.slice(3) : after !== 'amazonaws' ? after : undefined
    const endpoint = `${url.protocol}//${labels.slice(at).join('.')}`
    if (at === 0) return pathStyle(url, endpoint, region)
    const prefix = prefixOf(url)
    return {
      endpoint, bucket: labels.slice(0, at).join('.'), key: prefix ?? url.pathname.slice(1).split('/').map(decode).join('/'),
      style: 'virtual', listing: prefix != null, ...(region != null ? { region } : {}),
    }
  }

  const parse: S3UrlHelper['parse'] = url => {
    const scheme = /^s3:\/\/([^/?#]+)\/?([^?#]*)$/i.exec(url)
    if (scheme != null) {
      const bucket = scheme[1]!
      const endpoint = new URL(options.endpoint ?? DEFAULT_S3_ENDPOINT).origin
      const path = options.endpoint != null ? options.pathStyle ?? true : bucket.includes('.')
      return { endpoint, bucket, key: scheme[2]!, style: path ? 'path' : 'virtual', listing: false }
    }
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return undefined
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined
    if ([...parsed.searchParams.keys()].some(name => S3_PRESIGNED_PARAMS.includes(name.toLowerCase()))) return undefined
    if (endpoints.includes(parsed.origin)) return pathStyle(parsed, parsed.origin)
    return amazon(parsed)
  }

  const generic: S3UrlHelper['generic'] = url => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? pathStyle(parsed, parsed.origin) : undefined
    } catch {
      return undefined
    }
  }

  const bucketBase = (location: S3Location): string => {
    if (location.style === 'path') return `${location.endpoint}/${encodeURIComponent(location.bucket)}`
    const endpoint = new URL(location.endpoint)
    return `${endpoint.protocol}//${location.bucket}.${endpoint.host}`
  }

  const objectUrl: S3UrlHelper['objectUrl'] = (location, key) => `${bucketBase(location)}/${encodeKey(key)}`

  const listUrl: S3UrlHelper['listUrl'] = (location, prefix, page = {}) => {
    const query = new URLSearchParams({ 'list-type': '2', prefix })
    if (page.maxKeys != null) query.set('max-keys', String(page.maxKeys))
    if (page.token != null) query.set('continuation-token', page.token)
    return `${bucketBase(location)}${location.style === 'virtual' ? '/' : ''}?${query.toString()}`
  }

  return { parse, generic, objectUrl, listUrl }
}
