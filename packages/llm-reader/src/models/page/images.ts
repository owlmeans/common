import { ImageKind, ImageRole, PageRegion } from '../../consts.js'
import { textUtils } from '../../utils/text.js'
import { LAZY_SRC_ATTRIBUTES, LAZY_SRCSET_ATTRIBUTES, TRACKING_MARKERS } from './consts.js'
import { metadataHelper } from './metadata.js'
import type { ImageCandidate, PageImage } from './types.js'
import type { PageContext, RefMap } from './types.local.js'

const BACKGROUND_URL = /background(?:-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i

const numberOf = (value: string | null | undefined): number | undefined => {
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** `a.jpg 800w, b.jpg 1600w` → candidates. */
const parseSrcset = (srcset: string | null | undefined, base: string): ImageCandidate[] =>
  (srcset ?? '').split(/,\s+/).flatMap(entry => {
    const [src, descriptor] = entry.trim().split(/\s+/)
    const url = textUtils.absolute(src, base)
    return url != null ? [{ url, ...(descriptor != null ? { descriptor } : {}) }] : []
  })

/** The candidate a large screen would pick: the widest `w`, else the densest `x`, else the first. */
const best = (candidates: ImageCandidate[]): ImageCandidate | undefined =>
  [...candidates].sort((a, b) => {
    const size = (c: ImageCandidate) => Number.parseFloat(c.descriptor ?? '0') || 0
    return size(b) - size(a)
  })[0]

/** A guess from the markup alone; the model refines it with the whole context. */
const hintOf = (image: PageImage, element: Element | undefined, firstLarge: boolean): ImageRole | undefined => {
  const label = `${image.url} ${image.alt ?? ''} ${element?.getAttribute('class') ?? ''} ${element?.parentElement?.getAttribute('class') ?? ''}`.toLowerCase()
  const small = (image.width ?? Infinity) <= 48 && (image.height ?? Infinity) <= 48
  if ((image.width != null && image.width <= 2) || TRACKING_MARKERS.some(marker => marker.test(image.url))
    || /display\s*:\s*none/.test(element?.getAttribute('style') ?? '')) return ImageRole.Tracking
  if (image.kind === ImageKind.Icon) return ImageRole.Icon
  const home = image.link != null && new URL(image.link.url).pathname === '/'
  if (/logo/.test(label) || (image.region === PageRegion.Header && home)) return ImageRole.Logo
  if (/avatar|author|profile|headshot/.test(label)) return ImageRole.Avatar
  if (image.kind === ImageKind.Background) return ImageRole.Background
  if (small || image.kind === ImageKind.Svg) return ImageRole.Icon
  if (firstLarge || /hero|banner|cover/.test(label)) return ImageRole.Hero
  if (image.link != null && !image.inMain) return ImageRole.Thumbnail
  if (image.link != null && (image.width ?? 0) <= 400 && element?.closest('li, [class*="card"]') != null) return ImageRole.Thumbnail
  return undefined
}

/**
 * Every picture on the page with the context it is used in: where it sits (region, the heading
 * above it, the text around it), what wraps it (a link, a figure caption), how it is marked
 * (alt, size, lazy loading, presentational), and where else it is named (og:image, JSON-LD) —
 * one entry per URL, origins merged.
 */
export const readImages = (document: Document, url: string, refs: RefMap, context: PageContext): PageImage[] => {
  const images: PageImage[] = []
  const byUrl = new Map<string, PageImage>()
  const elements = new Map<PageImage, Element>()
  let order = 0

  const add = (image: Omit<PageImage, 'id' | 'order'>, element?: Element): void => {
    const known = byUrl.get(image.url)
    if (known != null) {
      known.origins = [...new Set([...known.origins, ...image.origins])]
      return
    }
    const entry: PageImage = { ...image, id: `img-${images.length + 1}`, order: order++ }
    images.push(entry)
    byUrl.set(entry.url, entry)
    if (element != null) elements.set(entry, element)
  }

  const placed = (element: Element) => {
    const anchor = element.closest('a[href]')
    const href = anchor != null ? textUtils.absolute(anchor.getAttribute('href'), url) : undefined
    const caption = textUtils.textOf(element.closest('figure')?.querySelector('figcaption'))
    const section = context.sectionOf(element)
    const around = context.contextOf(element)
    const ref = refs.refOf(element)
    return {
      region: context.regionOf(element),
      inMain: context.inMain(element),
      ...(href != null ? { link: { url: href, ...(textUtils.textOf(anchor) ? { text: textUtils.truncate(textUtils.textOf(anchor), 120) } : {}) } } : {}),
      ...(caption.length > 0 ? { caption } : {}),
      ...(section != null ? { section } : {}),
      ...(around != null ? { context: around } : {}),
      ...(ref != null ? { ref } : {}),
    }
  }

  const presentational = (element: Element): boolean =>
    element.getAttribute('alt') === '' || ['presentation', 'none'].includes(element.getAttribute('role') ?? '')
    || element.getAttribute('aria-hidden') === 'true'

  for (const element of refs.elements()) {
    const tag = element.tagName.toLowerCase()
    if (tag === 'img' || (tag === 'input' && element.getAttribute('type') === 'image')) {
      const picture = element.parentElement?.tagName.toLowerCase() === 'picture' ? element.parentElement : undefined
      const candidates = [
        ...parseSrcset(element.getAttribute('srcset'), url),
        ...LAZY_SRCSET_ATTRIBUTES.flatMap(name => parseSrcset(element.getAttribute(name), url)),
        ...Array.from(picture?.querySelectorAll('source') ?? []).flatMap(source => parseSrcset(source.getAttribute('srcset'), url)
          .map(candidate => ({ ...candidate, descriptor: candidate.descriptor ?? source.getAttribute('media') ?? undefined }))),
      ]
      const src = [element.getAttribute('src'), ...LAZY_SRC_ATTRIBUTES.map(name => element.getAttribute(name))]
        .map(value => textUtils.absolute(value, url))
        .find(value => value != null && !value.startsWith('data:'))
      const chosen = best(candidates)?.url ?? src
      if (chosen == null) continue
      const alt = element.getAttribute('alt')
      const title = element.getAttribute('title')
      const width = numberOf(element.getAttribute('width'))
      const height = numberOf(element.getAttribute('height'))
      const loading = element.getAttribute('loading')
      add({
        url: chosen,
        kind: tag === 'input' ? ImageKind.Input : picture != null ? ImageKind.Picture : ImageKind.Img,
        candidates: src != null && !candidates.some(c => c.url === src) ? [{ url: src }, ...candidates] : candidates,
        ...(alt != null ? { alt } : {}),
        ...(title != null ? { title } : {}),
        ...(width != null ? { width } : {}),
        ...(height != null ? { height } : {}),
        ...(loading != null ? { loading } : {}),
        decorative: presentational(element),
        origins: ['dom'],
        ...placed(element),
      }, element)
      continue
    }
    if (tag === 'svg' && element.parentElement?.closest('svg') == null) {
      const label = element.getAttribute('aria-label') ?? element.querySelector('title')?.textContent ?? undefined
      if (label == null && element.closest('a, button, header') == null) continue
      const width = numberOf(element.getAttribute('width'))
      const height = numberOf(element.getAttribute('height'))
      add({
        url: `inline:svg/${refs.refOf(element)}`,
        kind: ImageKind.Svg,
        candidates: [],
        ...(label != null ? { alt: textUtils.collapse(label), caption: textUtils.collapse(label) } : {}),
        ...(width != null ? { width } : {}),
        ...(height != null ? { height } : {}),
        decorative: presentational(element),
        origins: ['dom'],
        ...placed(element),
      }, element)
      continue
    }
    if (tag === 'video' && element.getAttribute('poster') != null) {
      const poster = textUtils.absolute(element.getAttribute('poster'), url)
      if (poster != null) add({ url: poster, kind: ImageKind.Poster, candidates: [], decorative: false, origins: ['dom'], ...placed(element) }, element)
      continue
    }
    const background = element.getAttribute('style')?.match(BACKGROUND_URL)?.[1]
    const backgroundUrl = background != null ? textUtils.absolute(background, url) : undefined
    if (backgroundUrl != null) {
      add({ url: backgroundUrl, kind: ImageKind.Background, candidates: [], decorative: true, origins: ['css'], ...placed(element) }, element)
    }
  }

  const meta = (value: string | null | undefined, origin: string): void => {
    const absolute = textUtils.absolute(value, url)
    if (absolute != null) add({ url: absolute, kind: ImageKind.Meta, candidates: [], decorative: false, region: PageRegion.Other, inMain: false, origins: [origin] })
  }
  meta(document.querySelector('meta[property="og:image"]')?.getAttribute('content'), 'og:image')
  meta(document.querySelector('meta[name="twitter:image"]')?.getAttribute('content'), 'twitter:image')
  metadataHelper.images(document).forEach(image => meta(image, 'json-ld'))
  for (const link of Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]'))) {
    const absolute = textUtils.absolute(link.getAttribute('href'), url)
    if (absolute != null) add({ url: absolute, kind: ImageKind.Icon, candidates: [], decorative: false, region: PageRegion.Other, inMain: false, origins: ['icon'] })
  }

  const firstLarge = images.find(image => image.kind !== ImageKind.Meta && (image.width ?? 0) >= 600
    && (image.region === PageRegion.Header || image.inMain))
  for (const image of images) {
    const hint = hintOf(image, elements.get(image), image === firstLarge)
    if (hint != null) image.hint = hint
  }

  return images
}
