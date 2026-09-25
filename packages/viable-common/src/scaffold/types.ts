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

/**
 * A labelled link on the landing page — a secondary pill, the "just browsing" link, a closing card.
 *
 * `href` is OPTIONAL and normally absent: absent means the default action the stamper decides
 * (start sign-in, or jump to a section of the page itself). A model never knows the application's
 * addresses, and an invented one is a link that 404s on the public face of the product.
 */
export interface PlanLink {
  label: string
  href?: string
}

/** The four shapes a bento tile's product fragment can take — each one a stamped primitive. */
export type BentoFragmentKind = 'list' | 'note' | 'people' | 'steps'

/**
 * A small piece of the product's own interface, drawn at the bottom of a bento tile.
 *
 * Structured for the same reason {@link SketchContent} is: the fragment is STAMPED, so it must be
 * rows a component can lay out, never a paragraph describing them. Built from the product's own
 * records, and decorative — the stamper renders it `aria-hidden`.
 */
export interface BentoFragment {
  kind: BentoFragmentKind
  /** Small caption over the fragment ("INGREDIENTS · 1 LOAF", "Baker's note"). */
  title?: string
  /** list: {label, value}; note: {label: text}; people: {label: name, value: role}; steps: {label}. */
  rows: { label: string, value?: string }[]
}

/**
 * What kind of control a landing-gate field is. A CLOSED set of the simplest native inputs: each
 * value is one plain element, so there is nothing here a visitor has to learn, and nothing that
 * can grow into a picker, a chip group or a preview.
 */
export type LandingGateFieldKind = 'text' | 'select' | 'number' | 'date'

/** One simple, non-sensitive field of the landing gate. */
export interface LandingGateField {
  /** The camelCase key the entered value travels under in the landing handoff: "dish". */
  name: string
  /** The visible label, in the end user's words: "What are you baking?". */
  label: string
  kind: LandingGateFieldKind
  /** An example value shown inside an empty text or number field — never a personal one. */
  placeholder?: string
  /** `select` only: 2–6 plain options. */
  options?: string[]
}

/**
 * The landing gate — the working entry into the product's key END-USER workflow, drawn in the
 * hero where the call-to-action pills would otherwise be.
 *
 * A guest fills in one to three simple non-sensitive fields on the landing page and signs in to
 * continue on the story's full-scale screen with what they entered already in place. It is a small
 * form and nothing more: no choices to browse, no sample results, no counts. Every text is copy in
 * the end user's own words; nothing here is an address the model invented — `target` is filled by
 * code.
 *
 * The keys after `note` are the shape a plan had before the gate became a form (chips, sample
 * records, a live count). They stay so a plan STORED under the old shape still validates and
 * still reads; nothing writes them and nothing draws from them, and a gate that carries no
 * `fields` is drawn as no gate at all.
 */
export interface LandingGatePlan {
  /** The key end-user story's code — never rendered. */
  story: string
  /** Entrypoint ALIAS of the story's full-scale screen in the user area (filled by code, not the model). */
  target?: string
  /** The heading of the form, in the end user's words: "What are you baking?". */
  question: string
  /** The fields, one to three — one whenever one is enough. Absent only on a plan stored under the old shape. */
  fields?: LandingGateField[]
  /** The one button's label: "Start my post →". */
  cta: string
  /** The muted line under the form: "No account needed. What you enter comes with you.". */
  note: string
  /** @deprecated Pre-form shape, kept for stored plans only. */
  hint?: string
  /** @deprecated Pre-form shape, kept for stored plans only. */
  label?: string
  /** @deprecated Pre-form shape, kept for stored plans only. */
  inputs?: string[]
  /** @deprecated Pre-form shape, kept for stored plans only. */
  selected?: string[]
  /** @deprecated Pre-form shape, kept for stored plans only. */
  results?: { title: string, meta: string, needs: string[] }[]
  /** @deprecated Pre-form shape, kept for stored plans only. */
  count?: { one: string, many: string, none: string }
  /** @deprecated Pre-form shape, kept for stored plans only. */
  empty?: string
  /** @deprecated Pre-form shape, kept for stored plans only. */
  lock?: string
}

/**
 * The gate as the planning MODEL answers it: the form, and none of the pre-form keys. Assignable
 * to {@link LandingGatePlan}, which is what a plan stores.
 */
export interface LandingGateAnswer {
  story: string
  target?: string
  question: string
  fields: LandingGateField[]
  cta: string
  note: string
}

/** The guest area's landing page — the product's public face. */
export interface GuestHomePlan {
  hero: {
    headline: string
    sub: string
    /** The primary pill's label — shown only when the page has no {@link GuestHomePlan.gate}. */
    cta: string
    /**
     * A badge above the headline — OPTIONAL and kept only so an older stored plan still reads.
     * The page renders no badge: the headline is what positions the product.
     */
    eyebrow?: string
    /** The second pill beside the primary one, when there is no gate. */
    secondary?: PlanLink
    /** The muted text link under the gate or the pills: "Just browsing? Explore bakes ›". */
    browse?: PlanLink
  }
  problem: { title: string, text: string }
  solution: { title: string, text: string }
  /** The bento tiles — four, each optionally anchored by a fragment of the product's interface. */
  features: { title: string, text: string, fragment?: BentoFragment }[]
  testimonials: { quote: string, name: string, role: string }[]
  /** "How it works" — three steps taken from the main flow. */
  steps?: { title: string, text: string }[]
  /** The small section labels and section headings; absent ones fall back to the stamper's own. */
  labels?: {
    steps?: string
    stepsTitle?: string
    features?: string
    featuresTitle?: string
    testimonials?: string
    testimonialsTitle?: string
    problem?: string
    solution?: string
  }
  /** The closing band: a headline, a lead, the two pills and two link cards. */
  closing?: {
    headline: string
    lead: string
    primary: string
    secondary?: PlanLink
    links?: { title: string, text: string, href?: string }[]
  }
  /**
   * The landing gate — present only when a gate story was decided for the project. When it is,
   * it REPLACES the hero's pills.
   */
  gate?: LandingGatePlan
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
   * How this product's illustrations should look — the scene, its domain objects and their
   * palette. The one field here that is prose, because it is read by a model.
   */
  motifs: string
}
