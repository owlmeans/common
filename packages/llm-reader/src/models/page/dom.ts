import { textUtils } from '../../utils/text.js'
import { OUTLINE_ATTRIBUTES, SKIPPED_TAGS } from './consts.js'
import type { DomIndex, DomNodeView } from './types.js'
import type { RefMap } from './types.local.js'

const DEFAULT_OUTLINE_BUDGET = 12_000
const DEFAULT_OUTLINE_DEPTH = 4
const ATTRIBUTE_CHARS = 80
const OWN_TEXT_CHARS = 100

/** Text of the node's own text children, not its descendants'. */
const ownText = (element: Element): string =>
  textUtils.collapse(Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent ?? '').join(' '))

const attributesOf = (element: Element): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const name of OUTLINE_ATTRIBUTES) {
    let value = element.getAttribute(name)
    if (value == null || value.length === 0) continue
    if (name === 'class') value = value.split(/\s+/).slice(0, 3).join(' ')
    out[name] = textUtils.truncate(value.trim(), ATTRIBUTE_CHARS)
  }
  return out
}

/** The ref-addressed view of a document the DOM-mode agent explores. */
export const createDomIndex = (document: Document, refs: RefMap): DomIndex => {
  const view = (element: Element): DomNodeView => ({
    ref: refs.refOf(element)!,
    tag: element.tagName.toLowerCase(),
    attributes: attributesOf(element),
    text: textUtils.truncate(ownText(element) || textUtils.textOf(element), OWN_TEXT_CHARS),
    children: element.children.length,
  })

  const line = (element: Element, indent: number): string => {
    const tag = element.tagName.toLowerCase()
    const attrs = Object.entries(attributesOf(element)).map(([k, v]) => ` ${k}="${v}"`).join('')
    const text = textUtils.truncate(ownText(element), OWN_TEXT_CHARS)
    return `${'  '.repeat(indent)}${refs.refOf(element)} <${tag}${attrs}>${text.length > 0 ? ` ${text}` : ''}`
  }

  const outline: DomIndex['outline'] = (ref, depth = DEFAULT_OUTLINE_DEPTH, budget = DEFAULT_OUTLINE_BUDGET) => {
    const root = ref != null ? refs.elementOf(ref) : document.body ?? document.documentElement
    if (root == null) return ''
    const lines: string[] = []
    let used = 0
    let truncated = false
    const walk = (element: Element, level: number): void => {
      if (truncated) return
      const tag = element.tagName.toLowerCase()
      const text = line(element, level)
      if (used + text.length > budget) {
        truncated = true
        return
      }
      lines.push(text)
      used += text.length + 1
      if (SKIPPED_TAGS.has(tag) || tag === 'svg') return
      const children = Array.from(element.children)
      if (level >= depth) {
        if (children.length > 0) lines.push(`${'  '.repeat(level + 1)}… ${children.length} child element(s) — expand ${refs.refOf(element)}`)
        return
      }
      children.forEach(child => walk(child, level + 1))
    }
    walk(root, 0)
    if (truncated) lines.push('… outline cut at its budget — expand a ref to see deeper')
    return lines.join('\n')
  }

  const query: DomIndex['query'] = (selector, limit = 20) =>
    Array.from(document.querySelectorAll(selector)).slice(0, limit).map(view)

  const find: DomIndex['find'] = (text, limit = 20) => {
    const needle = text.toLowerCase()
    return refs.elements()
      .filter(element => !SKIPPED_TAGS.has(element.tagName.toLowerCase()) && ownText(element).toLowerCase().includes(needle))
      .slice(0, limit)
      .map(view)
  }

  const node: DomIndex['node'] = ref => {
    const element = refs.elementOf(ref)
    return element != null ? view(element) : undefined
  }

  const text: DomIndex['text'] = (ref, max = 4000) => {
    const element = refs.elementOf(ref)
    return element != null ? textUtils.truncate(textUtils.textOf(element), max) : undefined
  }

  const selector: DomIndex['selector'] = ref => {
    let element = refs.elementOf(ref)
    if (element == null) return undefined
    const parts: string[] = []
    while (element != null && element.tagName.toLowerCase() !== 'html') {
      const tag = element.tagName.toLowerCase()
      const id = element.getAttribute('id')
      if (id != null && /^[A-Za-z][\w-]*$/.test(id) && document.querySelectorAll(`#${id}`).length === 1) {
        parts.unshift(`#${id}`)
        break
      }
      const parent: Element | null = element.parentElement
      const siblings = parent != null ? Array.from(parent.children).filter(child => child.tagName === element!.tagName) : []
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(element) + 1})` : tag)
      element = parent ?? undefined
    }
    return parts.join(' > ')
  }

  return { outline, query, find, node, text, selector }
}
