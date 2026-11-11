import type { PageContent, PageMeta } from '../models/page/types.js'
import type { PageDescription } from './types.js'

/**
 * The description as Markdown — rendered by the package, so its shape never depends on the model:
 * title, a facts line, then summary, structure, key links, pictures and the content.
 */
export const renderDescription = (
  url: string, meta: PageMeta, described: Omit<PageDescription, 'markdown'>, content: PageContent | undefined,
): string => {
  const facts = [
    `[${url}](${url})`, `type: ${described.pageType}`,
    meta.language != null ? `language: ${meta.language}` : undefined,
    meta.author != null ? `author: ${meta.author.value}` : undefined,
    meta.published != null ? `published: ${meta.published.value}` : undefined,
    meta.site != null ? `site: ${meta.site.value}` : undefined,
  ].filter(part => part != null).join(' · ')
  const sections = [
    `# ${described.pageTitle}`, '', facts, '',
    '## Summary', '', described.summary,
  ]
  if (described.structure.length > 0) {
    sections.push('', '## Structure', '', ...described.structure.map(item => `- **${item.block}** — ${item.purpose}`))
  }
  if (described.keyLinks.length > 0) {
    sections.push('', '## Key links', '', ...described.keyLinks.map(link => `- [${link.label}](${link.url}) — ${link.purpose}`))
  }
  if (described.images.length > 0) {
    sections.push('', '## Images', '', ...described.images.map(image => `- \`${image.id}\` **${image.role}** — ${image.usage}`))
  }
  if (content != null && content.markdown.length > 0) {
    sections.push('', '## Content', '', content.markdown)
  }

  return `${sections.join('\n').trim()}\n`
}
