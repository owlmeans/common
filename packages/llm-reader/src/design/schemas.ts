const text = { type: 'string' } as const

const entries = (properties: string[]) => ({
  type: 'array',
  items: {
    type: 'object',
    properties: Object.fromEntries(properties.map(name => [name, text])),
    required: properties,
    additionalProperties: false,
  },
})

/** What the design write-up asks for: token arrays (no free maps) and the prose of every section. */
export const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The product or brand name.' },
    description: { type: 'string', description: 'One sentence: what this design system is for.' },
    colors: entries(['name', 'value', 'role']),
    typography: entries(['name', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']),
    rounded: entries(['name', 'value']),
    spacing: entries(['name', 'value']),
    components: entries(['name', 'backgroundColor', 'textColor', 'typography', 'rounded', 'padding', 'size', 'height', 'width']),
    sections: {
      type: 'object',
      properties: {
        overview: text, colors: text, typography: text, layout: text, elevation: text, shapes: text,
        components: text, dosAndDonts: text, responsive: text, agentGuide: text,
      },
      required: ['overview', 'colors', 'typography', 'layout', 'elevation', 'shapes', 'components', 'dosAndDonts', 'responsive', 'agentGuide'],
      additionalProperties: false,
    },
  },
  required: ['name', 'description', 'colors', 'typography', 'rounded', 'spacing', 'components', 'sections'],
  additionalProperties: false,
} as const
