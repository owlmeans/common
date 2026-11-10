import type { TextUtils } from './text/types.js'

/** Content that is never readable text. */
const HIDDEN = new Set(['script', 'style', 'noscript', 'template'])

/** Elements that start a new line of text. */
const BLOCKS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre',
  'section', 'table', 'tbody', 'td', 'th', 'tr', 'ul', 'button', 'label', 'option',
])

export const createTextUtils = (): TextUtils => {
  const collapse = (text: string | null | undefined): string =>
    (text ?? '').replace(/\s+/g, ' ').trim()

  const textOf = (node: Node | null | undefined): string => {
    if (node == null) return ''
    const parts: string[] = []
    const walk = (current: Node): void => {
      if (current.nodeType === 3) {
        parts.push(current.textContent ?? '')
        return
      }
      if (current.nodeType !== 1 && current.nodeType !== 9 && current.nodeType !== 11) return
      const tag = (current as Element).tagName?.toLowerCase()
      if (tag != null && HIDDEN.has(tag)) return
      const block = tag != null && BLOCKS.has(tag)
      if (block) parts.push(' ')
      for (const child of Array.from(current.childNodes)) walk(child)
      if (block) parts.push(' ')
    }
    walk(node)
    return collapse(parts.join(''))
  }

  const truncate = (text: string, max: number): string => {
    if (text.length <= max) return text
    const cut = text.slice(0, Math.max(0, max - 1))
    const space = cut.lastIndexOf(' ')
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
  }

  const labelOf = (contentType: string | null | undefined): string | undefined =>
    contentType?.match(/charset\s*=\s*["']?([\w.:-]+)/i)?.[1]?.toLowerCase()

  const sniff = (bytes: Uint8Array): string | undefined => {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
    return head.match(/<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i)?.[1]?.toLowerCase()
  }

  const decode: TextUtils['decode'] = (bytes, contentType) => {
    const label = labelOf(contentType) ?? sniff(bytes) ?? 'utf-8'
    try {
      return { text: new TextDecoder(label).decode(bytes), charset: label }
    } catch {
      return { text: new TextDecoder('utf-8').decode(bytes), charset: 'utf-8' }
    }
  }

  const absolute = (href: string | null | undefined, base: string): string | undefined => {
    const value = href?.trim()
    if (value == null || value.length === 0) return undefined
    try {
      const url = new URL(value, base)
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
    } catch {
      return undefined
    }
  }

  const siteOf = (url: string): string => {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    } catch {
      return ''
    }
  }

  return { collapse, textOf, truncate, decode, absolute, siteOf }
}

export const textUtils = createTextUtils()
