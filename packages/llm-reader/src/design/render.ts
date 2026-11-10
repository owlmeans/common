import { DESIGN_SECTIONS } from '../consts.js'
import { colorHelper } from './colors.js'
import type { DesignDraft, DesignFacts, DesignTokens } from './types.js'

const DIMENSION = /^-?\d*\.?\d+(px|em|rem)$/
const UNITLESS = /^-?\d*\.?\d+$/

/** The draft's section keys in DESIGN.md order — the spec's eight, then the two extras. */
const SECTION_KEYS: readonly (keyof DesignDraft['sections'])[] = Object.freeze([
  'overview', 'colors', 'typography', 'layout', 'elevation', 'shapes', 'components', 'dosAndDonts', 'responsive', 'agentGuide',
])

const COMPONENT_PROPERTIES = ['backgroundColor', 'textColor', 'typography', 'rounded', 'padding', 'size', 'height', 'width'] as const

/**
 * A token name every exporter accepts: lower-case kebab. A leading digit is kept when the name has a
 * letter (`2xl` is a YAML string); an all-digit name would be read back as a number, so it is prefixed.
 */
const slug = (name: string): string => {
  const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return /[a-z]/.test(clean) ? clean : `t-${clean || 'token'}`
}

/** A YAML 1.2 scalar: a number stays bare, everything else is a JSON string — valid YAML by construction. */
const scalar = (value: string | number): string => typeof value === 'number' ? String(value) : JSON.stringify(value)

/** `24` → `24px`; a px/em/rem dimension as is; anything else `undefined`. */
const dimension = (value: string): string | undefined => {
  const trimmed = value.trim()
  if (DIMENSION.test(trimmed)) return trimmed
  if (UNITLESS.test(trimmed) && Number(trimmed) !== 0) return `${trimmed}px`
  if (trimmed === '0') return '0px'
  return undefined
}

/**
 * Render a DESIGN.md (Google Labs spec, alpha) from the model's draft. The model never writes
 * YAML: the package emits the front matter itself, every scalar a JSON string or a bare number,
 * token names slugged, values checked (colors parse, dimensions carry px/em/rem), component
 * references resolved — or dropped with a warning — and a `primary` color guaranteed. The body
 * follows the spec's section order, with Responsive Behavior and Agent Prompt Guide after it.
 */
export const renderDesignMd = (draft: DesignDraft, facts: DesignFacts): { markdown: string, tokens: DesignTokens, warnings: string[] } => {
  const warnings: string[] = []
  const unique = <T extends { name: string }>(entries: T[], group: string): (T & { key: string })[] => {
    const seen = new Set<string>()
    return entries.flatMap(entry => {
      const key = slug(entry.name)
      if (seen.has(key)) {
        warnings.push(`duplicate ${group} token "${entry.name}" dropped`)
        return []
      }
      seen.add(key)
      return [{ ...entry, key }]
    })
  }

  const colors: Record<string, string> = {}
  for (const entry of unique(draft.colors, 'color')) {
    const hex = colorHelper.normalize(entry.value)
    if (hex == null) {
      warnings.push(`color "${entry.name}" has no valid value (${entry.value}) — dropped`)
      continue
    }
    colors[entry.key] = hex.toUpperCase()
  }
  if (colors.primary == null) {
    const accent = [...facts.colors].sort((a, b) => b.accent - a.accent)[0]?.value ?? Object.values(colors)[0]
    if (accent != null) {
      colors.primary = accent.toUpperCase()
      warnings.push('no "primary" color drafted — the most used accent color was named primary')
    }
  }

  const typography: DesignTokens['typography'] = {}
  for (const entry of unique(draft.typography, 'typography')) {
    const style: Record<string, string | number> = {}
    if (entry.fontFamily.trim()) style.fontFamily = entry.fontFamily.replace(/["']/g, '').split(',')[0]!.trim()
    const size = dimension(entry.fontSize)
    if (size != null) style.fontSize = size
    const weight = Number.parseInt(entry.fontWeight, 10)
    if (Number.isFinite(weight) && weight > 0) style.fontWeight = weight
    const line = entry.lineHeight.trim()
    if (UNITLESS.test(line)) style.lineHeight = Number(line)
    else if (DIMENSION.test(line)) style.lineHeight = line
    const spacing = entry.letterSpacing.trim()
    if (DIMENSION.test(spacing)) style.letterSpacing = spacing
    if (Object.keys(style).length > 0) typography[entry.key] = style
  }

  const scale = (entries: { name: string, value: string }[], group: string): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const entry of unique(entries, group)) {
      const value = group === 'rounded' && /9999|50%|full/.test(entry.value) ? '9999px' : dimension(entry.value)
      if (value == null) warnings.push(`${group} "${entry.name}" is not a px/em/rem dimension (${entry.value}) — dropped`)
      else out[entry.key] = value
    }
    return out
  }
  const rounded = scale(draft.rounded, 'rounded')
  const spacing = scale(draft.spacing, 'spacing')

  const groups: Record<string, Record<string, unknown>> = { colors, typography, rounded, spacing }
  const resolves = (reference: string): boolean => {
    const [group, token] = reference.slice(1, -1).split('.')
    return group != null && token != null && groups[group]?.[token] != null
  }
  const components: DesignTokens['components'] = {}
  for (const entry of unique(draft.components, 'component')) {
    const props: Record<string, string> = {}
    for (const property of COMPONENT_PROPERTIES) {
      const raw = entry[property]?.trim()
      if (raw == null || raw.length === 0) continue
      if (/^\{.+\}$/.test(raw)) {
        if (resolves(raw)) props[property] = raw
        else warnings.push(`component "${entry.name}" ${property} references ${raw}, which does not exist — dropped`)
        continue
      }
      if (property === 'backgroundColor' || property === 'textColor') {
        const hex = colorHelper.normalize(raw)?.toUpperCase()
        if (hex == null) continue
        // A literal equal to a palette color becomes a reference to it.
        const named = Object.entries(colors).find(([, value]) => value === hex)?.[0]
        props[property] = named != null ? `{colors.${named}}` : hex
        continue
      }
      props[property] = raw
    }
    if (Object.keys(props).length > 0) components[entry.key] = props
  }

  const tokens: DesignTokens = {
    name: draft.name.trim() || 'Untitled',
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    colors, typography, rounded, spacing, components,
  }

  const yaml: string[] = ['---', `version: ${scalar('alpha')}`, `name: ${scalar(tokens.name)}`]
  if (tokens.description != null) yaml.push(`description: ${scalar(tokens.description)}`)
  const map = (key: string, values: Record<string, string>): void => {
    if (Object.keys(values).length === 0) return
    yaml.push(`${key}:`, ...Object.entries(values).map(([name, value]) => `  ${name}: ${scalar(value)}`))
  }
  const nested = (key: string, values: Record<string, Record<string, string | number>>): void => {
    if (Object.keys(values).length === 0) return
    yaml.push(`${key}:`)
    for (const [name, props] of Object.entries(values)) {
      yaml.push(`  ${name}:`, ...Object.entries(props).map(([prop, value]) => `    ${prop}: ${scalar(value)}`))
    }
  }
  map('colors', colors)
  nested('typography', typography)
  map('rounded', rounded)
  map('spacing', spacing)
  nested('components', components)
  yaml.push('---')

  const body = SECTION_KEYS.flatMap((key, index) => {
    const prose = draft.sections[key]?.trim()
    return prose != null && prose.length > 0 ? [`## ${DESIGN_SECTIONS[index]}`, '', prose.replace(/^#{1,2}\s.*\n+/, ''), ''] : []
  })

  return { markdown: `${yaml.join('\n')}\n\n# ${tokens.name}\n\n${body.join('\n').trim()}\n`, tokens, warnings }
}
