import { textUtils } from '../utils/text.js'
import type { MetaValue, PageModel } from '../models/page/types.js'
import { PACK_IMAGES, PACK_LINKS } from './consts.js'

const value = (meta: MetaValue | undefined): string | undefined =>
  meta != null ? `${meta.value} (${meta.source})` : undefined

/**
 * Everything a text-mode call reads about a page, in one message: metadata with its evidence, the
 * markup signals, the heading outline, the main content, and the link and picture inventories. The
 * content gets the larger part of the budget; anything cut says so, so the model never mistakes a
 * truncated page for a short one. The same page always renders the same pack — it is sent as the
 * stable lead of every task on that page.
 */
export const buildPack = async (page: PageModel, budget: number): Promise<string> => {
  const meta = page.meta()
  const signals = page.signals()
  const content = await page.content()
  const facts = [
    ['URL', page.url],
    ['Title', value(meta.title)],
    ['Description', value(meta.description)],
    ['Author', value(meta.author)],
    ['Published', value(meta.published)],
    ['Modified', value(meta.modified)],
    ['Site', value(meta.site)],
    ['Language', meta.language],
    ['Open Graph type', meta.ogType],
    ['Schema.org types', meta.schemaTypes.join(', ') || undefined],
  ].filter((entry): entry is [string, string] => entry[1] != null).map(([k, v]) => `${k}: ${v}`)
  const signalLine = [
    `words ${signals.words} (main ${signals.mainWords})`, `headings ${signals.headings}`,
    `links ${signals.links} (internal ${signals.internalLinks})`, `images ${signals.images}`, `forms ${signals.forms}`,
    `password field ${signals.passwordField ? 'yes' : 'no'}`, `search field ${signals.searchField ? 'yes' : 'no'}`,
    `prices ${signals.prices}`, `repeated card groups ${signals.repeatedItems}`, `calls to action ${signals.callsToAction}`,
    `<article> ${signals.hasArticle ? 'yes' : 'no'}`, `byline ${signals.hasByline ? 'yes' : 'no'}`,
    `<time> ${signals.hasTime ? 'yes' : 'no'}`, `app shell ${signals.appShell ? 'yes' : 'no'}`,
  ].join(' · ')
  const outline = page.outline().map(heading => `${'  '.repeat(Math.max(0, heading.level - 1))}- h${heading.level} ${heading.text}`)

  const links = page.links()
  const linkLines = links.slice(0, PACK_LINKS).map(link =>
    `- [${link.text || '(no text)'}](${link.url}) · ${link.region}/${link.kind}${link.section != null ? ` · under "${textUtils.truncate(link.section, 60)}"` : ''}`)
  const images = page.images()
  const imageLines = images.slice(0, PACK_IMAGES).map(image => {
    const parts = [
      `${image.id} ${image.kind} ${image.url}`,
      image.alt != null ? `alt="${textUtils.truncate(image.alt, 100)}"` : undefined,
      image.width != null ? `${image.width}×${image.height ?? '?'}` : undefined,
      `region ${image.region}${image.inMain ? ' (main content)' : ''}`,
      image.hint != null ? `looks like ${image.hint}` : undefined,
      image.decorative ? 'marked decorative' : undefined,
      image.link != null ? `links to ${image.link.url}` : undefined,
      image.caption != null ? `caption "${textUtils.truncate(image.caption, 120)}"` : undefined,
      image.section != null ? `under "${textUtils.truncate(image.section, 60)}"` : undefined,
      image.context != null ? `context "${textUtils.truncate(image.context, 140)}"` : undefined,
      image.origins.length > 1 || image.origins[0] !== 'dom' ? `named in ${image.origins.join(', ')}` : undefined,
    ]
    return `- ${parts.filter(part => part != null).join(' · ')}`
  })

  const head = [
    '# Page', ...facts, `Signals: ${signalLine}`,
    '', '## Outline', ...(outline.length > 0 ? outline : ['(no headings)']),
  ].join('\n')
  const tail = [
    '', `## Links (${links.length}${links.length > PACK_LINKS ? `, first ${PACK_LINKS} shown` : ''})`, ...(linkLines.length > 0 ? linkLines : ['(none)']),
    '', `## Images (${images.length}${images.length > PACK_IMAGES ? `, first ${PACK_IMAGES} shown` : ''})`, ...(imageLines.length > 0 ? imageLines : ['(none)']),
  ].join('\n')
  const room = Math.max(2000, budget - head.length - Math.min(tail.length, Math.floor(budget * 0.35)))
  const body = content.markdown.length > room
    ? `${content.markdown.slice(0, room)}\n\n[… content cut at ${room} of ${content.markdown.length} characters]`
    : content.markdown || '(no readable content — the page may need scripts to render)'
  const inventory = tail.length > budget * 0.35 ? `${tail.slice(0, Math.floor(budget * 0.35))}\n[… list cut]` : tail

  return `${head}\n\n## Main content (${content.method}, ${content.wordCount} words)\n${body}\n${inventory}`
}
