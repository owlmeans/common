import type { ReaderModels } from '../execution/types.js'
import type { PageFetcher } from '../fetch/fetcher/types.js'

/** How a color is used, weighted by the elements that use it. */
export interface ColorFact {
  /** `#rrggbb` or `#rrggbbaa`. */
  value: string
  text: number
  background: number
  border: number
  /** Links, buttons, focus and hover states. */
  accent: number
  /** The selectors or roles it came from (a few). */
  sources: string[]
}

/** The type style of one role (body, h1…h6, link, button, small, lead, price). */
export interface TypeFact {
  role: string
  fontFamily?: string
  fontSize?: string
  fontWeight?: string
  lineHeight?: string
  letterSpacing?: string
}

export interface ScaleFact {
  value: string
  count: number
}

export interface ComponentFact {
  /** button-primary, button-secondary, button, card, input, header, footer, nav, badge. */
  name: string
  declarations: Record<string, string>
}

/** A large block of the page, identified from its markup. */
export interface BlockFact {
  /** header, hero, logos, features, pricing, testimonial, cards, article, form, footer, section. */
  kind: string
  summary: string
}

/** What the design of a page measurably is — the input the design write-up is grounded in. */
export interface DesignFacts {
  /** `static` = parsed CSS; `rendered` = computed styles from a browser; `both` = merged. */
  source: 'static' | 'rendered' | 'both'
  variables: { name: string, value: string }[]
  colors: ColorFact[]
  fonts: { family: string, weight: number }[]
  typeScale: TypeFact[]
  spacing: ScaleFact[]
  radii: ScaleFact[]
  shadows: ScaleFact[]
  breakpoints: string[]
  components: ComponentFact[]
  blocks: BlockFact[]
  /** Families declared by `@font-face` or loaded from a font service. */
  fontsLoaded: string[]
  stylesheets: { url: string, ok: boolean, bytes: number }[]
}

/** The DESIGN.md token set (Google Labs spec), as the package renders it. */
export interface DesignTokens {
  name: string
  description?: string
  colors: Record<string, string>
  typography: Record<string, Record<string, string | number>>
  rounded: Record<string, string>
  spacing: Record<string, string>
  components: Record<string, Record<string, string>>
}

/** The prose of each body section, Markdown, by section name. */
export type DesignProse = Partial<Record<string, string>> // keys are the DESIGN_SECTIONS names

export interface DesignReport {
  /** The DESIGN.md file. */
  markdown: string
  tokens: DesignTokens
  facts: DesignFacts
  /** What the renderer had to correct or drop. */
  warnings: string[]
}

export interface DesignOptions {
  /** Proxy key stylesheets are fetched under — the page's own. */
  key?: string
}

export interface DesignAnalystOptions {
  models: ReaderModels
  fetcher: PageFetcher
  /** Linked stylesheets read, at most. Default 10. */
  maxStylesheets?: number
}

/** The design of one page. */
export interface DesignAnalyst {
  /**
   * Its measurable design — stylesheets fetched, CSS parsed; a page that was rendered
   * (`page.rendered`) has its computed styles merged over the parse.
   */
  facts: (options?: DesignOptions) => Promise<DesignFacts>
  /** Its design system as a DESIGN.md. */
  analyze: (options?: DesignOptions) => Promise<DesignReport>
}

/** What the model fills — arrays rather than maps, so every provider can be asked for it. */
export interface DesignDraft {
  name: string
  description: string
  colors: { name: string, value: string, role: string }[]
  typography: { name: string, fontFamily: string, fontSize: string, fontWeight: string, lineHeight: string, letterSpacing: string }[]
  rounded: { name: string, value: string }[]
  spacing: { name: string, value: string }[]
  components: {
    name: string, backgroundColor: string, textColor: string, typography: string, rounded: string, padding: string,
    size: string, height: string, width: string,
  }[]
  sections: {
    overview: string, colors: string, typography: string, layout: string, elevation: string, shapes: string,
    components: string, dosAndDonts: string, responsive: string, agentGuide: string
  }
}
