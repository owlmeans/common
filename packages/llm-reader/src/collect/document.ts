import { parseHTML } from 'linkedom'
import { CollectRole } from '../consts.js'
import { textUtils } from '../utils/text.js'
import {
  ABSOLUTE_ATTRIBUTES, ANIMATION_ATTRIBUTES, FONT_EXTENSIONS, FRAME_TAGS, ICON_RELS, IMAGE_EXTENSIONS, SCRIPT_RELS, URL_ATTRIBUTES,
} from './consts.local.js'
import { cssRefs } from './css.js'
import { collectPaths } from './paths.js'
import type { BundleDocument, DocumentReference, SrcsetCandidate } from './types.local.js'

const parseSrcset = (value: string): SrcsetCandidate[] => {
  const candidates: SrcsetCandidate[] = []
  let at = 0
  while (at < value.length) {
    while (at < value.length && /[\s,]/.test(value[at]!)) at++
    if (at >= value.length) break
    let start = at
    while (at < value.length && !/\s/.test(value[at]!)) at++
    let url = value.slice(start, at)
    let descriptor = ''
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '')
    } else {
      start = at
      let depth = 0
      while (at < value.length && !(value[at] === ',' && depth === 0)) {
        if (value[at] === '(') depth++
        if (value[at] === ')') depth--
        at++
      }
      descriptor = value.slice(start, at).trim()
    }
    if (url !== '') candidates.push({ url, descriptor })
  }
  return candidates
}

const relsOf = (element: Element): string[] => (element.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).filter(rel => rel !== '')

/** What a stylesheet's `url()` most likely is, from its extension. */
const roleOfUrl = (url: string): CollectRole => {
  const extension = collectPaths.extensionOf(new URL(url).pathname)
  return FONT_EXTENSIONS.includes(extension) ? CollectRole.Font : IMAGE_EXTENSIONS.includes(extension) ? CollectRole.Image : CollectRole.Asset
}

/** A page's HTML as a bundle page: sanitized, its resources listed, its references pointed at local copies. */
export const makeBundleDocument = (source: string, url: string): BundleDocument => {
  const document = parseHTML(source).document as unknown as Document
  const elements = (): Element[] => Array.from(document.querySelectorAll('*'))
  // The page's own `<base href>` decides what its relative references meant, before it is removed.
  const base = textUtils.absolute(document.querySelector('base[href]')?.getAttribute('href'), url) ?? url

  const absolute = (href: string | null | undefined): string | undefined => textUtils.absolute(href, base)

  /** An absolute URL split into the part a bundle maps and its fragment. */
  const split = (url: string): { key: string, hash: string } => {
    const parsed = new URL(url)
    const hash = parsed.hash
    parsed.hash = ''
    return { key: parsed.href, hash }
  }

  const sanitize: BundleDocument['sanitize'] = () => {
    for (const element of elements()) {
      const tag = element.tagName.toLowerCase()
      if (tag === 'script' || tag === 'base') {
        element.remove()
        continue
      }
      if (tag === 'meta') {
        const equiv = (element.getAttribute('http-equiv') ?? '').toLowerCase()
        // Refresh navigates away; a CSP was written for the original origin; the charset is redeclared below.
        if (['refresh', 'content-security-policy', 'content-security-policy-report-only', 'content-type'].includes(equiv) || element.hasAttribute('charset')) {
          element.remove()
          continue
        }
      }
      if (tag === 'link') {
        const rels = relsOf(element)
        const as = (element.getAttribute('as') ?? '').toLowerCase()
        if (rels.some(rel => SCRIPT_RELS.includes(rel) || rel === 'import')
          || ((rels.includes('preload') || rels.includes('prefetch') || rels.includes('prerender')) && ['script', 'worker', 'document', 'fetch', ''].includes(as))) {
          element.remove()
          continue
        }
      }
      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase()
        // Browsers ignore control characters and whitespace inside a scheme: `java\tscript:` runs.
        const compact = attribute.value.replace(/[\u0000- \u007f]/g, '').toLowerCase()
        const active = compact.startsWith('javascript:') || compact.startsWith('vbscript:')
        if (name.startsWith('on') || name === 'srcdoc'
          || ((URL_ATTRIBUTES.includes(name) || ANIMATION_ATTRIBUTES.includes(name)) && active)
          || (FRAME_TAGS.has(tag) && (name === 'src' || name === 'data') && compact.startsWith('data:'))) {
          element.removeAttribute(attribute.name)
        }
      }
    }
    let head = document.head as Element | null
    if (head == null) {
      head = document.createElement('head')
      document.documentElement?.prepend(head)
    }
    const charset = document.createElement('meta')
    charset.setAttribute('charset', 'utf-8')
    head.prepend(charset)
  }

  /** Every resource reference of one element: `[attribute, role, srcset?]`. */
  const kept = (element: Element): Array<[string, CollectRole, boolean]> => {
    const tag = element.tagName.toLowerCase()
    switch (tag) {
      case 'link': {
        const rels = relsOf(element)
        const as = (element.getAttribute('as') ?? '').toLowerCase()
        if (rels.includes('stylesheet') || (rels.includes('preload') && as === 'style')) return [['href', CollectRole.Stylesheet, false]]
        if (rels.some(rel => ICON_RELS.includes(rel)) || (rels.includes('preload') && as === 'image')) return [['href', CollectRole.Image, false]]
        if (rels.includes('preload') && as === 'font') return [['href', CollectRole.Font, false]]
        return []
      }
      case 'img':
        return [['src', CollectRole.Image, false], ['srcset', CollectRole.Image, true], ['data-src', CollectRole.Image, false], ['data-srcset', CollectRole.Image, true]]
      case 'source':
        return element.parentElement?.tagName.toLowerCase() === 'picture' ? [['srcset', CollectRole.Image, true], ['src', CollectRole.Image, false]] : []
      case 'video':
        return [['poster', CollectRole.Image, false]]
      case 'input':
        return (element.getAttribute('type') ?? '').toLowerCase() === 'image' ? [['src', CollectRole.Image, false]] : []
      case 'image':
        return [['href', CollectRole.Image, false], ['xlink:href', CollectRole.Image, false]]
      default:
        return []
    }
  }

  const cssReferences = (css: string): DocumentReference[] => cssRefs.references(css).flatMap(reference => {
    const url = absolute(reference.href)
    if (url == null) return []
    const { key } = split(url)
    return [{ url: key, role: reference.kind === 'import' ? CollectRole.Stylesheet : roleOfUrl(key) }]
  })

  const references: BundleDocument['references'] = () => {
    const found = new Map<string, DocumentReference>()
    const add = (reference: DocumentReference): void => {
      if (!found.has(reference.url)) found.set(reference.url, reference)
    }
    for (const element of elements()) {
      // A picture a script-free page never shows is not worth keeping.
      if (element.closest('noscript') != null) continue
      for (const [name, role, srcset] of kept(element)) {
        const value = element.getAttribute(name)
        if (value == null) continue
        const hrefs = srcset ? parseSrcset(value).map(candidate => candidate.url) : [value]
        hrefs.map(absolute).forEach(url => url != null && add({ url: split(url).key, role }))
      }
      if (element.tagName.toLowerCase() === 'style') cssReferences(element.textContent ?? '').forEach(add)
      const inline = element.getAttribute('style')
      if (inline != null) cssReferences(inline).forEach(add)
    }
    return [...found.values()]
  }

  const rewrite: BundleDocument['rewrite'] = localOf => {
    /** The reference to write for `href`: the local copy, else the absolute URL, else as it was. */
    const target = (href: string): string => {
      const url = absolute(href)
      if (url == null) return href
      const { key, hash } = split(url)
      const local = localOf(key)
      return local != null ? `${local}${hash}` : url
    }
    const css = (text: string): string => cssRefs.rewrite(text, reference => absolute(reference.href) != null ? target(reference.href) : undefined)

    for (const element of elements()) {
      const tag = element.tagName.toLowerCase()
      for (const [name, , srcset] of kept(element)) {
        const value = element.getAttribute(name)
        if (value == null) continue
        element.setAttribute(name, srcset
          ? parseSrcset(value).map(candidate => [target(candidate.url), candidate.descriptor].filter(part => part !== '').join(' ')).join(', ')
          : target(value))
      }
      for (const name of ABSOLUTE_ATTRIBUTES[tag] ?? []) {
        if (tag === 'source' && kept(element).length > 0) continue
        const value = element.getAttribute(name)
        if (value != null && !value.trim().startsWith('#')) element.setAttribute(name, absolute(value) ?? value)
      }
      if (tag === 'style') element.textContent = css(element.textContent ?? '')
      const inline = element.getAttribute('style')
      if (inline != null) element.setAttribute('style', css(inline))
    }
  }

  const html: BundleDocument['html'] = () => document.toString()

  return { sanitize, references, rewrite, html }
}
