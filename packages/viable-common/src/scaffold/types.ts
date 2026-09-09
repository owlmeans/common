import type { ProjectArea } from '../areas/consts.js'
import type { WidgetKind } from './consts.js'

/**
 * The placeholder content of one drawn widget.
 *
 * Structured rather than free text because the scaffold STAMPS these into code without a model:
 * a paragraph describing a table cannot be turned into columns deterministically, a list of
 * column names can.
 */
export interface SketchContent {
  /** The heading the placeholder carries. */
  headline: string
  /** One line under it saying what the finished thing will show. */
  caption: string
  /** Example rows, for a list. */
  items?: string[]
  /** Column names, for a table. */
  columns?: string[]
  /** Field labels, for a form. */
  fields?: string[]
  /** Bars, for a chart — `value` is a 0..100 magnitude, not real data. */
  series?: { label: string, value: number }[]
  /** Figures, for a summary. */
  stats?: { label: string, value: string }[]
}

/** What the scaffold draws for one user story. */
export interface ScaffoldStoryPlan {
  /** The story's code — always one of the codes the planner was given. */
  code: string
  /** The top-menu section, inside the story's own area, this story belongs to. */
  section: string
  /** The screen name the story's implementation should adopt: `{section}/{purpose}`. */
  screen: string
  /** The dashboard widget this story owns. */
  widget: { kind: WidgetKind, title: string, description: string }
  /** What the placeholder shows until the story is implemented. */
  sketch: SketchContent
  /** Whether this widget is important enough to also appear on its area's home screen. */
  home: boolean
  /**
   * The story whose preview this one renders instead of drawing its own.
   *
   * A pure OPTIMIZATION hint, and every consumer treats it as untrusted: absent, dropped, or
   * naming a code that is not in the plan, the story falls back to owning its own widget and the
   * drawn tree is exactly what it is today. It exists because a main flow's consecutive steps act
   * on the SAME record through the same shape, and drawing a near-duplicate form for each one
   * fills an area with previews that differ only in their heading.
   *
   * The arrow points at the OWNER, and only ever backwards in plan order — `fillScaffoldPlan`
   * resolves and clamps it, so nothing downstream has to reason about cycles or forward
   * references.
   */
  sharesWidgetWith?: string
  /**
   * The story whose SCREEN this one renders instead of drawing its own.
   *
   * Same rules and the same clamp as {@link sharesWidgetWith}, and deliberately a separate field:
   * two steps can want one form on one screen, or one form reached from two screens, and
   * collapsing both decisions into one flag makes the second unexpressible.
   */
  sharesScreenWith?: string
}

/** One area's shape: how its top menu is divided, and how it introduces itself. */
export interface ScaffoldAreaPlan {
  area: ProjectArea
  /** The introduction widget on the area's home screen. */
  intro: { title: string, text: string }
  /** The top-menu sections of this area, in menu order. */
  sections: string[]
}

/**
 * What the application calls itself, everywhere a machine reads it.
 *
 * Not branding and not decoration: this is what the document's `<title>`, its description and its
 * icon are built from. The one page an anonymous visitor can reach is a sign-in page, served from
 * a machine-generated hostname — and a sign-in page carrying no title, no description and no icon
 * is the exact shape Safe Browsing scores as credential phishing. A generated application that
 * never replaced the template's placeholder ships that shape by default, so the identity is
 * planned here and stamped like every other part of the scaffold.
 */
export interface ProductIdentity {
  /** The product's own name, as a person reads it. Never a slug, never a placeholder. */
  name: string
  /** One sentence saying what the product is, for `<meta name="description">`. */
  description: string
}

/** The guest area's landing page — the product's public face. */
export interface GuestHomePlan {
  hero: { eyebrow: string, headline: string, sub: string, cta: string }
  problem: { title: string, text: string }
  solution: { title: string, text: string }
  features: { title: string, text: string }[]
  testimonials: { quote: string, name: string, role: string }[]
}

/**
 * Everything one cheap call decides about a project's scaffolding.
 *
 * It is a PLAN, never code: the stamping that turns it into screens, widgets and dashboards is
 * deterministic, so the same plan always produces the same tree and a re-scaffold is idempotent.
 */
export interface ScaffoldPlan {
  /** What this application is called and what it says it is. */
  identity: ProductIdentity
  guestHome: GuestHomePlan
  areas: ScaffoldAreaPlan[]
  stories: ScaffoldStoryPlan[]
  /**
   * How this product's illustrations should look — geometry and motif, in the design system's
   * own vocabulary. The one field here that is prose, because it is read by a model.
   */
  motifs: string
}
