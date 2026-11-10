import * as csstree from 'css-tree'
import { textUtils } from '../utils/text.js'
import type { PageModel } from '../models/page/types.js'
import type { RenderedPage } from '../render/types.js'
import { colorHelper } from './colors.js'
import {
  COLOR_ENTRIES, COMPONENT_PROPERTIES, COMPONENT_SELECTORS, MAX_RULES, ROOT_FONT_PX, ROOT_SELECTORS,
  SCALE_ENTRIES, SPACING_PROPERTIES, TYPE_PROPERTIES, TYPE_ROLES,
} from './consts.js'
import type { BlockFact, ColorFact, ComponentFact, DesignFacts, ScaleFact, TypeFact } from './types.js'
import type { CssRule, DesignFactsHelper } from './types.local.js'

const tally = (counts: Map<string, number>, value: string, weight: number): void => {
  counts.set(value, (counts.get(value) ?? 0) + weight)
}

const top = (counts: Map<string, number>, n: number): ScaleFact[] =>
  [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count: Math.round(count) }))

/** `1rem` → `16px`; px stays; anything else is not a spacing step. */
const toPx = (token: string): string | undefined => {
  const match = token.match(/^(-?\d*\.?\d+)(px|rem|em)$/)
  if (match == null) return undefined
  const n = Number(match[1]) * (match[2] === 'px' ? 1 : ROOT_FONT_PX)
  return n > 0 ? `${Math.round(n * 100) / 100}px` : undefined
}

/** Every rule of a stylesheet, with the media query it sits under. */
const rulesOf = (css: string): { rules: CssRule[], breakpoints: string[], fontFaces: string[] } => {
  const rules: CssRule[] = []
  const breakpoints: string[] = []
  const fontFaces: string[] = []
  let ast: csstree.CssNode
  try {
    ast = csstree.parse(css, { parseValue: false, parseCustomProperty: false, onParseError: () => undefined })
  } catch {
    return { rules, breakpoints, fontFaces }
  }
  const media: string[] = []
  csstree.walk(ast, {
    enter: (node: csstree.CssNode) => {
      if (node.type === 'Atrule' && node.name === 'media' && node.prelude != null) {
        const prelude = csstree.generate(node.prelude)
        media.push(prelude)
        for (const match of prelude.matchAll(/(?:min|max)-width\s*:\s*(\d*\.?\d+(?:px|em|rem))/g)) {
          breakpoints.push(toPx(match[1]!) ?? match[1]!)
        }
      }
      if (node.type === 'Atrule' && node.name === 'font-face' && node.block != null) {
        csstree.walk(node.block, {
          visit: 'Declaration',
          enter: (declaration: csstree.Declaration) => {
            if (declaration.property === 'font-family') fontFaces.push(csstree.generate(declaration.value).replace(/["']/g, '').trim())
          },
        })
      }
      if (node.type === 'Rule' && node.prelude.type === 'SelectorList') {
        const declarations: [string, string][] = []
        node.block.children.forEach(child => {
          if (child.type === 'Declaration') declarations.push([child.property.toLowerCase(), csstree.generate(child.value).trim()])
        })
        rules.push({
          selectors: csstree.generate(node.prelude).split(',').map(s => s.trim()).filter(s => s.length > 0),
          declarations,
          ...(media.length > 0 ? { media: media[media.length - 1] } : {}),
        })
      }
    },
    leave: (node: csstree.CssNode) => {
      if (node.type === 'Atrule' && node.name === 'media') media.pop()
    },
  })
  return { rules, breakpoints, fontFaces }
}

/** `var(--x, fallback)` resolved against the custom properties, a few levels deep. */
const resolver = (variables: Map<string, string>) => {
  const resolve = (value: string, depth = 0): string =>
    depth > 5 ? value : value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name: string, fallback?: string) => {
      const found = variables.get(name)
      return found != null ? resolve(found, depth + 1) : fallback?.trim() ?? ''
    })
  return resolve
}

/** A selector with its states removed, so `a:hover` can be matched to the links it styles. */
const matchable = (selector: string): string =>
  selector.replace(/::?[a-z-]+(\([^)]*\))?/gi, '').replace(/\s+/g, ' ').trim() || '*'

const blocksOf = (page: PageModel): BlockFact[] => {
  const document = page.document()
  const blocks: BlockFact[] = []
  const heading = (element: Element): string => textUtils.truncate(textUtils.textOf(element.querySelector('h1, h2, h3')), 80)
  const header = document.querySelector('header, [role="banner"]')
  if (header != null) {
    blocks.push({ kind: 'header', summary: `${header.querySelectorAll('a').length} links, ${header.querySelectorAll('img, svg').length} images` })
  }
  const main = document.querySelector('main, [role="main"]') ?? document.body
  const sections = main != null
    ? Array.from(main.children).filter(child => !['script', 'style', 'header', 'footer'].includes(child.tagName.toLowerCase()))
    : []
  sections.forEach((section, index) => {
    const text = textUtils.textOf(section)
    const images = section.querySelectorAll('img, svg, picture').length
    const cards = section.querySelectorAll('.card, li, [class*="card"]').length
    const prices = (text.match(/[$€£]\s?\d/g) ?? []).length
    const label = `${section.tagName.toLowerCase()}${section.getAttribute('class') != null ? `.${section.getAttribute('class')!.split(/\s+/)[0]}` : ''}`
    const kind = section.tagName.toLowerCase() === 'article' ? 'article'
      : /hero/.test(label) || (index === 0 && section.querySelector('h1') != null) ? 'hero'
        : prices >= 2 ? 'pricing'
          : section.querySelector('blockquote') != null ? 'testimonial'
            : cards >= 3 && section.querySelector('h3') != null ? 'features'
              : images >= 3 && text.split(/\s+/).length < 40 ? 'logos'
                : cards >= 3 ? 'cards'
                  : section.querySelector('form') != null ? 'form'
                    : 'section'
    blocks.push({ kind, summary: `${label}${heading(section) ? ` "${heading(section)}"` : ''} · ${images} images, ${cards} items, ${text.split(/\s+/).filter(Boolean).length} words` })
  })
  const footer = document.querySelector('footer, [role="contentinfo"]')
  if (footer != null) blocks.push({ kind: 'footer', summary: `${footer.querySelectorAll('a').length} links` })
  return blocks
}

export const createDesignFactsHelper = (): DesignFactsHelper => {
  /**
   * The design of a page as parsed CSS reveals it. Every rule is weighted by how many elements of
   * the page its selector matches — a stylesheet shared by a whole site, or a utility framework,
   * styles far more than one page uses, and an unmatched rule says nothing about this page.
   */
  const read = (page: PageModel, sheets: string[], stylesheets: DesignFacts['stylesheets']): DesignFacts => {
    const document = page.document()
    const parsed = [...sheets, ...page.styles()].map(rulesOf)
    const rules = parsed.flatMap(sheet => sheet.rules).slice(0, MAX_RULES)
    const inline = Array.from(document.querySelectorAll('[style]')).map(element => ({
      selectors: [], weight: 1,
      declarations: (element.getAttribute('style') ?? '').split(';').map(part => part.split(':'))
        .filter(pair => pair.length >= 2).map(([k, ...v]) => [k!.trim().toLowerCase(), v.join(':').trim()] as [string, string]),
    }))

    const variables = new Map<string, string>()
    for (const rule of rules) {
      if (!rule.selectors.some(selector => ROOT_SELECTORS.has(selector))) continue
      for (const [property, value] of rule.declarations) {
        if (property.startsWith('--')) variables.set(property, value)
      }
    }
    const resolve = resolver(variables)

    const weights = new Map<string, number>()
    const weightOf = (selector: string): number => {
      let weight = weights.get(selector)
      if (weight == null) {
        try {
          weight = document.querySelectorAll(matchable(selector)).length
        } catch {
          weight = 0
        }
        weights.set(selector, weight)
      }
      return weight
    }

    const bodyElements = document.body?.querySelectorAll('*').length ?? 1
    const colors = new Map<string, ColorFact>()
    const color = (value: string, use: 'text' | 'background' | 'border' | 'accent', weight: number, source: string): void => {
      for (const hex of colorHelper.extract(value)) {
        const fact = colors.get(hex) ?? { value: hex, text: 0, background: 0, border: 0, accent: 0, sources: [] }
        fact[use] += weight
        if (fact.sources.length < 4 && !fact.sources.includes(source)) fact.sources.push(source)
        colors.set(hex, fact)
      }
    }
    const fonts = new Map<string, number>()
    const spacing = new Map<string, number>()
    const radii = new Map<string, number>()
    const shadows = new Map<string, number>()
    const type = new Map<string, TypeFact>()
    const components = new Map<string, Record<string, string>>()

    for (const rule of [...rules.map(rule => ({ ...rule, weight: -1 })), ...inline]) {
      const selectors = rule.selectors
      const matched = rule.weight >= 0 ? rule.weight : Math.max(0, ...selectors.map(weightOf))
      if (matched === 0) continue
      const weight = matched * ((rule as CssRule).media != null ? 0.5 : 1)
      const interactive = selectors.some(selector => /(^|[\s>+~])(a|button)\b|\.btn|:hover|:focus|:active/.test(selector))
      const label = selectors[0] ?? 'style'
      for (const [property, raw] of rule.declarations) {
        if (property.startsWith('--')) continue
        const value = resolve(raw)
        if (property === 'color') color(value, interactive ? 'accent' : 'text', weight, label)
        else if (property === 'background' || property === 'background-color') color(value, interactive ? 'accent' : 'background', weight, label)
        else if (property.startsWith('border') && property !== 'border-radius' && !property.endsWith('width') && !property.endsWith('style')) color(value, 'border', weight, label)
        else if (property === 'outline-color' || property === 'fill' || property === 'stroke') color(value, 'accent', weight, label)
        if (property === 'font-family') {
          const family = value.split(',')[0]?.replace(/["']/g, '').trim()
          // A font set on the root is inherited by every element under it.
          const inherited = selectors.some(selector => ROOT_SELECTORS.has(selector)) ? bodyElements : weight
          if (family != null && family.length > 0) tally(fonts, family, inherited)
        }
        if (SPACING_PROPERTIES.has(property)) value.split(/\s+/).map(toPx).forEach(px => px != null && tally(spacing, px, weight))
        if (property === 'border-radius' && value !== '0' && value !== '') tally(radii, value, weight)
        if (property === 'box-shadow' && value !== 'none' && value !== '') tally(shadows, value, weight)
      }
      for (const selector of selectors) {
        const role = TYPE_ROLES[selector]
        if (role != null) {
          const fact = type.get(role) ?? { role }
          for (const [property, raw] of rule.declarations) {
            if (!TYPE_PROPERTIES.includes(property)) continue
            const value = resolve(raw)
            const key = ({ 'font-family': 'fontFamily', 'font-size': 'fontSize', 'font-weight': 'fontWeight', 'line-height': 'lineHeight', 'letter-spacing': 'letterSpacing' } as const)[property as 'font-family']
            fact[key] = property === 'font-family' ? value.split(',')[0]!.replace(/["']/g, '').trim() : value
          }
          type.set(role, fact)
        }
        if (/:(hover|focus|active)/.test(selector)) continue
        const component = COMPONENT_SELECTORS.find(([, pattern]) => pattern.test(selector))?.[0]
        if (component != null) {
          const declarations = components.get(component) ?? {}
          for (const [property, raw] of rule.declarations) {
            if (COMPONENT_PROPERTIES.has(property)) declarations[property] = resolve(raw)
          }
          components.set(component, declarations)
        }
      }
    }

    const fontsLoaded = new Set(parsed.flatMap(sheet => sheet.fontFaces))
    for (const link of Array.from(document.querySelectorAll('link[href*="fonts.googleapis.com"]'))) {
      for (const family of (link.getAttribute('href') ?? '').matchAll(/family=([^:&]+)/g)) fontsLoaded.add(decodeURIComponent(family[1]!.replace(/\+/g, ' ')))
    }
    const colorWeight = (fact: ColorFact): number => fact.text + fact.background + fact.border + fact.accent * 2

    return {
      source: 'static',
      variables: [...variables.entries()].map(([name, value]) => ({ name, value: resolve(value) })),
      colors: [...colors.values()].sort((a, b) => colorWeight(b) - colorWeight(a)).slice(0, COLOR_ENTRIES)
        .map(fact => ({ ...fact, text: Math.round(fact.text), background: Math.round(fact.background), border: Math.round(fact.border), accent: Math.round(fact.accent) })),
      fonts: [...fonts.entries()].sort((a, b) => b[1] - a[1]).map(([family, weight]) => ({ family, weight: Math.round(weight) })),
      typeScale: [...type.values()],
      spacing: top(spacing, SCALE_ENTRIES).sort((a, b) => Number.parseFloat(a.value) - Number.parseFloat(b.value)),
      radii: top(radii, SCALE_ENTRIES),
      shadows: top(shadows, SCALE_ENTRIES),
      breakpoints: [...new Set(parsed.flatMap(sheet => sheet.breakpoints))].sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b)),
      components: [...components.entries()].map(([name, declarations]): ComponentFact => ({ name, declarations })),
      blocks: blocksOf(page),
      fontsLoaded: [...fontsLoaded],
      stylesheets,
    }
  }

  /**
   * Computed styles from a rendered page win over parsed CSS for what a layout engine knows better:
   * the type scale, the colors that are actually on screen, radii and shadows in use. Breakpoints,
   * components (by selector) and loaded fonts stay as parsed.
   */
  const merge = (facts: DesignFacts, rendered: RenderedPage): DesignFacts => {
    const samples = rendered.styles ?? []
    if (samples.length === 0) return facts
    const colors = new Map<string, ColorFact>()
    const add = (value: string | undefined, use: 'text' | 'background' | 'border' | 'accent', weight: number, role: string) => {
      const hex = value != null ? colorHelper.normalize(value) : undefined
      if (hex == null) return
      const fact = colors.get(hex) ?? { value: hex, text: 0, background: 0, border: 0, accent: 0, sources: [] }
      fact[use] += Math.round(weight * 1000)
      if (fact.sources.length < 4 && !fact.sources.includes(role)) fact.sources.push(role)
      colors.set(hex, fact)
    }
    const radii = new Map<string, number>()
    const shadows = new Map<string, number>()
    for (const sample of samples) {
      const interactive = ['link', 'button'].includes(sample.role)
      add(sample.color, interactive ? 'accent' : 'text', sample.weight, sample.role)
      add(sample.background, interactive ? 'accent' : 'background', sample.weight, sample.role)
      add(sample.borderColor, 'border', sample.weight, sample.role)
      if (sample.radius != null && sample.radius !== '0px') tally(radii, sample.radius, sample.count)
      if (sample.shadow != null && sample.shadow !== 'none') tally(shadows, sample.shadow, sample.count)
    }
    const typeScale: TypeFact[] = samples
      .filter(sample => /^(body|heading-\d|link|button|input|text)$/.test(sample.role) && sample.fontSize != null)
      .map(sample => ({
        role: sample.role.replace(/^heading-/, 'h'),
        ...(sample.fontFamily != null ? { fontFamily: sample.fontFamily.split(',')[0]!.replace(/["']/g, '').trim() } : {}),
        ...(sample.fontSize != null ? { fontSize: sample.fontSize } : {}),
        ...(sample.fontWeight != null ? { fontWeight: sample.fontWeight } : {}),
        ...(sample.lineHeight != null ? { lineHeight: sample.lineHeight } : {}),
        ...(sample.letterSpacing != null && sample.letterSpacing !== 'normal' ? { letterSpacing: sample.letterSpacing } : {}),
      }))
    const sum = (fact: ColorFact): number => fact.text + fact.background + fact.border + fact.accent

    return {
      ...facts,
      source: 'both',
      variables: rendered.variables != null && Object.keys(rendered.variables).length > 0
        ? Object.entries(rendered.variables).map(([name, value]) => ({ name, value }))
        : facts.variables,
      colors: [...colors.values()].sort((a, b) => sum(b) - sum(a)).slice(0, COLOR_ENTRIES),
      typeScale: typeScale.length > 0 ? typeScale : facts.typeScale,
      radii: radii.size > 0 ? top(radii, SCALE_ENTRIES) : facts.radii,
      shadows: shadows.size > 0 ? top(shadows, SCALE_ENTRIES) : facts.shadows,
    }
  }

  return { read, merge }
}

export const designFactsHelper = createDesignFactsHelper()
