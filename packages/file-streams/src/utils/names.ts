import { COMPOUND_EXTENSIONS, MAX_NAME_BYTES } from './names/consts.js'
import type { NameUtils } from './names/types.js'

export const createNameUtils = (): NameUtils => {
  const sanitize = (name: string | undefined): string | undefined => {
    if (name == null) {
      return undefined
    }
    let base = name.replace(/\\/g, '/').split('/').pop()?.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '') ?? ''
    base = base.normalize('NFC').trim().replace(/^\.+/, '').replace(/[. ]+$/, '')
    if (base === '' || base === '..') {
      return undefined
    }
    while (Buffer.byteLength(base) > MAX_NAME_BYTES) {
      base = base.slice(0, -1)
    }

    return base
  }

  const decode = (value: string): string => {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  const fromDisposition = (header: string | undefined): string | undefined => {
    if (header == null || header === '') {
      return undefined
    }
    const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
    if (extended != null) {
      return sanitize(decode(extended[2].trim().replace(/^"|"$/g, '')))
    }
    const plain = /filename\s*=\s*("(?:[^"\\]|\\.)*"|[^;]+)/i.exec(header)
    if (plain != null) {
      const value = plain[1].trim()
      return sanitize(value.startsWith('"') ? value.slice(1, -1).replace(/\\(.)/g, '$1') : value)
    }

    return undefined
  }

  const fromUrl = (url: URL): string | undefined => {
    const segment = url.pathname.split('/').filter(part => part !== '').pop()
    return segment != null ? sanitize(decode(segment)) : undefined
  }

  const fromKey = (key: string): string | undefined => sanitize(key.split('/').filter(part => part !== '').pop())

  const extOf = (name: string | undefined): string | undefined => {
    if (name == null) {
      return undefined
    }
    const lower = name.toLowerCase()
    const compound = COMPOUND_EXTENSIONS.find(ext => lower.endsWith(`.${ext}`))
    if (compound != null) {
      return compound
    }
    const dot = lower.lastIndexOf('.')

    return dot > 0 && dot < lower.length - 1 ? lower.slice(dot + 1) : undefined
  }

  return { fromDisposition, fromUrl, fromKey, sanitize, extOf }
}

export const nameUtils = createNameUtils()
