import type { DesignDraft, DesignFacts } from '@owlmeans/llm-reader'

/**
 * A DESIGN.md draft from the measured facts alone — what is rendered when no model writes one: the
 * colours ranked by use, the measured type scale, spacing and radii, and one-line sections.
 */
export const factsDraftOf = (facts: DesignFacts, name: string): DesignDraft => {
  const hex = facts.colors.filter(color => /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color.value))
  const top = (weight: (color: DesignFacts['colors'][number]) => number) =>
    [...hex].sort((a, b) => weight(b) - weight(a))[0]?.value
  const roles: Array<[string, string | undefined, string]> = [
    ['primary', top(color => color.accent), 'actions and links'],
    ['background', top(color => color.background), 'page ground'],
    ['on-surface', top(color => color.text), 'body text'],
    ['border', top(color => color.border), 'lines and outlines'],
  ]
  const seen = new Set<string>()
  const colors = roles.flatMap(([role, value, use]) => {
    if (value == null || seen.has(value)) return []
    seen.add(value)
    return [{ name: role, value, role: use }]
  })
  const typography = facts.typeScale.slice(0, 8).map(entry => ({
    name: entry.role, fontFamily: entry.fontFamily ?? '', fontSize: entry.fontSize ?? '', fontWeight: entry.fontWeight ?? '',
    lineHeight: entry.lineHeight ?? '', letterSpacing: entry.letterSpacing ?? '',
  }))

  return {
    name,
    description: `The design system measured from ${name}.`,
    colors,
    typography,
    rounded: facts.radii.slice(0, 3).map((entry, index) => ({ name: ['sm', 'md', 'lg'][index]!, value: entry.value })),
    spacing: facts.spacing.slice(0, 6).map((entry, index) => ({ name: `s${index + 1}`, value: entry.value })),
    components: [],
    sections: {
      overview: 'Measured from the page; no designer\'s write-up was available.',
      colors: colors.map(color => `${color.name} ${color.value}`).join(', '),
      typography: [...new Set(facts.fonts.map(font => font.family))].slice(0, 3).join(', '),
      layout: facts.blocks.length > 0 ? `Blocks top to bottom: ${facts.blocks.map(block => block.kind).join(', ')}.` : '',
      elevation: facts.shadows.length > 0 ? `Shadows: ${facts.shadows.slice(0, 2).map(entry => entry.value).join(' | ')}.` : 'Flat.',
      shapes: facts.radii.length > 0 ? `Corners: ${facts.radii.slice(0, 3).map(entry => entry.value).join(', ')}.` : '',
      components: facts.components.map(component => component.name).join(', '),
      dosAndDonts: '',
      responsive: facts.breakpoints.length > 0 ? `Breakpoints: ${facts.breakpoints.join(', ')}.` : '',
      agentGuide: 'Follow the colours, fonts and shapes above.',
    },
  }
}
