import { XML_ENTITIES } from './consts.local.js'
import type { S3ErrorDocument, S3Listing, S3ListedObject, S3XmlHelper } from './types.js'

const decode = (text: string): string => text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, name: string) => {
  if (name.startsWith('#x')) return String.fromCodePoint(parseInt(name.slice(2), 16))
  if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)))
  return XML_ENTITIES[name] ?? whole
})

const tagOf = (xml: string, name: string): string | undefined => {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml)
  return match != null ? decode(match[1]!) : undefined
}

export const createS3XmlHelper = (): S3XmlHelper => {
  const listing: S3XmlHelper['listing'] = xml => {
    if (!/<ListBucketResult[\s>]/.test(xml)) return undefined
    const objects: S3ListedObject[] = []
    for (const [, block] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = tagOf(block!, 'Key')
      if (key == null) continue
      const size = Number(tagOf(block!, 'Size'))
      objects.push({ key, ...(Number.isFinite(size) ? { size } : {}) })
    }
    const bucket = tagOf(xml, 'Name')
    const token = tagOf(xml, 'NextContinuationToken')
    return {
      objects, truncated: tagOf(xml, 'IsTruncated')?.trim() === 'true',
      ...(bucket != null ? { bucket } : {}), ...(token != null && token !== '' ? { token } : {}),
    } satisfies S3Listing
  }

  const error: S3XmlHelper['error'] = xml => {
    const body = /<Error>([\s\S]*?)<\/Error>/.exec(xml)?.[1]
    const code = body != null ? tagOf(body, 'Code') : undefined
    if (body == null || code == null || code.trim() === '') return undefined
    const message = tagOf(body, 'Message')
    return { code: code.trim(), ...(message != null ? { message } : {}) } satisfies S3ErrorDocument
  }

  return { listing, error }
}

export const s3XmlHelper = createS3XmlHelper()
