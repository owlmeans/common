import type { ProbeResult } from './types.js'
import type { Tally } from './types.local.js'

/**
 * Runs INSIDE the rendered page (serialized by Playwright — it may use nothing from this module's
 * scope). Samples the computed styles of visible elements by role, weighted by on-screen area, and
 * reads the `:root` custom properties and the large blocks of the layout.
 */
export const probePage = (limit: number): ProbeResult => {
  const roleOf = (element: Element): string | undefined => {
    const tag = element.tagName.toLowerCase()
    const cls = typeof element.className === 'string' ? element.className.toLowerCase() : ''
    if (tag === 'body') return 'body'
    if (/^h[1-6]$/.test(tag)) return `heading-${tag[1]}`
    if (tag === 'button' || element.getAttribute('role') === 'button' || /\b(btn|button)\b/.test(cls)) return 'button'
    if (tag === 'a') return 'link'
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input'
    if (/\bcard\b/.test(cls)) return 'card'
    if (tag === 'nav' || tag === 'header' || tag === 'footer') return tag
    const ownText = Array.from(element.childNodes).some(node => node.nodeType === 3 && (node.textContent ?? '').trim().length > 0)
    return ownText ? 'text' : undefined
  }
  const roles = new Map<string, { count: number, area: number, values: Tally }>()
  const vote = (tally: Tally, property: string, value: string | undefined, weight: number): void => {
    if (value == null || value === '' || value === 'none' || value === 'normal' || value === 'rgba(0, 0, 0, 0)') return
    const votes = tally[property] ??= {}
    votes[value] = (votes[value] ?? 0) + weight
  }
  let total = 0
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const elements = Array.from(document.querySelectorAll('body, body *')).slice(0, limit)
  for (const element of elements) {
    const rect = element.getBoundingClientRect()
    const area = Math.min(rect.width, viewport.width) * Math.min(rect.height, viewport.height * 3)
    if (area <= 0) continue
    const style = getComputedStyle(element)
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue
    const role = roleOf(element)
    if (role == null) continue
    const entry = roles.get(role) ?? { count: 0, area: 0, values: {} }
    entry.count++
    entry.area += area
    total += area
    const weight = role === 'body' ? 1 : area
    vote(entry.values, 'color', style.color, weight)
    vote(entry.values, 'background', style.backgroundColor, weight)
    if (Number.parseFloat(style.borderTopWidth) > 0) vote(entry.values, 'borderColor', style.borderTopColor, weight)
    vote(entry.values, 'fontFamily', style.fontFamily, weight)
    vote(entry.values, 'fontSize', style.fontSize, weight)
    vote(entry.values, 'fontWeight', style.fontWeight, weight)
    vote(entry.values, 'lineHeight', style.lineHeight, weight)
    vote(entry.values, 'letterSpacing', style.letterSpacing, weight)
    if (style.borderTopLeftRadius !== '0px') vote(entry.values, 'radius', style.borderTopLeftRadius, weight)
    vote(entry.values, 'shadow', style.boxShadow, weight)
    if (style.padding !== '0px') vote(entry.values, 'padding', style.padding, weight)
    if (style.gap !== 'normal' && style.gap !== '0px') vote(entry.values, 'gap', style.gap, weight)
    roles.set(role, entry)
  }
  const top = (votes: Record<string, number> | undefined): string | undefined =>
    votes == null ? undefined : Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0]
  const styles = [...roles.entries()].map(([role, entry]) => {
    const sample: Record<string, string | number> = { role, count: entry.count, weight: total > 0 ? entry.area / total : 0 }
    for (const property of ['color', 'background', 'borderColor', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'radius', 'shadow', 'padding', 'gap']) {
      const value = top(entry.values[property])
      if (value != null) sample[property] = value
    }
    return sample as unknown as ProbeResult['styles'][number]
  })

  const variables: Record<string, string> = {}
  const root = getComputedStyle(document.documentElement)
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // a cross-origin sheet without CORS cannot be read
    }
    for (const rule of Array.from(rules)) {
      const styleRule = rule as CSSStyleRule
      if (styleRule.selectorText == null || !/(^|,)\s*(:root|html)\s*(,|$)/.test(styleRule.selectorText)) continue
      for (let i = 0; i < styleRule.style.length; i++) {
        const name = styleRule.style[i]!
        if (name.startsWith('--')) variables[name] = root.getPropertyValue(name).trim()
      }
    }
  }

  const container = document.querySelector('main') ?? document.body
  const blocks = Array.from(document.body.children).concat(container !== document.body ? Array.from(container.children) : [])
    .map(element => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.height >= 80 && rect.width >= viewport.width * 0.3)
    .slice(0, 30)
    .map(({ element, rect }) => ({
      tag: element.tagName.toLowerCase(),
      label: element.id || (typeof element.className === 'string' ? element.className.split(/\s+/)[0] : '') || undefined,
      x: Math.round(rect.x), y: Math.round(rect.y + window.scrollY), width: Math.round(rect.width), height: Math.round(rect.height),
      background: getComputedStyle(element).backgroundColor,
      text: ((element as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 100),
    }))

  return { styles, variables, blocks, viewport }
}
