import type { TextLink, TextPart, TextUtils } from './text/types.js'

export const createTextUtils = (): TextUtils => {
  const placeholder = /\{\{\s*([\w-]+)\s*\}\}/g

  const fill = (template: string, values: Record<string, string | number>): string =>
    template.replace(placeholder, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match)

  const parts = (template: string, links: Record<string, TextLink>): TextPart[] => {
    const result: TextPart[] = []
    let last = 0
    for (const match of template.matchAll(placeholder)) {
      const link = links[match[1]]
      if (link == null) {
        continue
      }
      if (match.index > last) {
        result.push({ text: template.slice(last, match.index) })
      }
      result.push({ text: link.text, href: link.href, key: match[1] })
      last = match.index + match[0].length
    }
    if (last < template.length) {
      result.push({ text: template.slice(last) })
    }

    return result
  }

  return { fill, parts }
}

export const textUtils = createTextUtils()
