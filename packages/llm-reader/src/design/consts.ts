/** Linked stylesheets a design analysis reads, at most. */
export const DEFAULT_MAX_STYLESHEETS = 10

/** Rules matched against the DOM, at most — enough for any hand-written stylesheet. */
export const MAX_RULES = 4000

/** Selectors whose declarations are design tokens. */
export const ROOT_SELECTORS: ReadonlySet<string> = new Set([':root', 'html', 'body', ':host', '*'])

/** Simple selectors → type-scale role. */
export const TYPE_ROLES: Readonly<Record<string, string>> = Object.freeze({
  html: 'body', body: 'body', p: 'paragraph', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
  a: 'link', button: 'button', '.btn': 'button', '.button': 'button', small: 'small', '.small': 'small',
  '.lead': 'lead', '.price': 'price', label: 'label', input: 'input', code: 'code', blockquote: 'quote',
})

export const TYPE_PROPERTIES: readonly string[] = Object.freeze(['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'])

/** Component name → selector fragments that identify it. First match wins. */
export const COMPONENT_SELECTORS: ReadonlyArray<readonly [string, RegExp]> = Object.freeze([
  ['button-primary', /\.(btn|button)[-_]?primary\b|button\.primary\b|\.primary[-_]?(btn|button)\b/],
  ['button-secondary', /\.(btn|button)[-_]?(secondary|outline|ghost)\b/],
  ['button', /(^|[\s>+~,])(button|\.btn|\.button)(?![-\w])/],
  ['card', /\.card\b/],
  ['input', /(^|[\s>+~,])(input|textarea|select)(?![-\w])/],
  ['header', /(^|[\s>+~,])(header|\.site-header|\.header)(?![-\w])/],
  ['footer', /(^|[\s>+~,])(footer|\.site-footer|\.footer)(?![-\w])/],
  ['nav', /(^|[\s>+~,])(nav|\.nav|\.navbar)(?![-\w])/],
  ['badge', /\.(badge|chip|tag|pill)\b/],
] as const)

/** Declarations a component fact keeps. */
export const COMPONENT_PROPERTIES: ReadonlySet<string> = new Set([
  'background', 'background-color', 'color', 'border', 'border-color', 'border-radius', 'padding', 'font-size',
  'font-weight', 'box-shadow', 'height', 'min-height',
])

export const SPACING_PROPERTIES: ReadonlySet<string> = new Set([
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'padding', 'padding-top', 'padding-bottom',
  'padding-left', 'padding-right', 'gap', 'row-gap', 'column-gap', 'margin-block', 'margin-inline', 'padding-block', 'padding-inline',
])

/** Root font size a `rem` / `em` is converted with. */
export const ROOT_FONT_PX = 16

/** Entries kept per scale and colors kept in the facts. */
export const SCALE_ENTRIES = 10
export const COLOR_ENTRIES = 24

export const DESIGN_INSTRUCTION = [
  'You are a senior web designer. From the measured design facts of this page (and its screenshot, when attached),',
  'document its design system as a DESIGN.md: a token set and the prose of each section.',
  'Colors: name them by role (primary, secondary, tertiary, neutral, surface, on-surface, accent, border, error, …);',
  'always name a primary; use only colors that appear in the facts. Typography: 6 to 12 levels named by role',
  '(display, h1, h2, h3, body-lg, body-md, body-sm, label, caption, button, …) with values taken from the facts,',
  'sizes in px or rem. Rounded and spacing: the scale the facts show, in px or rem. Components: the ones the page',
  'has (button-primary, button-secondary, card, input, nav, …), referring to tokens as {colors.primary},',
  '{typography.label} or {rounded.md} wherever a value matches a token; leave a field empty when it does not apply.',
  'Sections, concise Markdown without headings: overview = look and feel, personality, audience; colors = the',
  'palette and where each role is used; typography = the pairing and how the scale is used; layout = grid, spacing',
  'rhythm and the page\'s key blocks; elevation = shadows, or how a flat design separates layers; shapes = the corner',
  'language; components = how buttons, cards and inputs look and behave; dosAndDonts = guardrails as a bullet list;',
  'responsive = the breakpoints and how the layout adapts; agentGuide = short instructions for an AI agent building',
  'new screens in this style.',
].join(' ')
