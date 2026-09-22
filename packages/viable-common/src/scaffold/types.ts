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
 * The landing gate — the working entry into the product's key END-USER workflow, drawn in the
 * hero where the call-to-action pills would otherwise be.
 *
 * A guest makes a few non-sensitive choices on the landing page, sees sample results ranked
 * against them, and signs in to continue on the story's full-scale screen with those choices
 * carried over. Every field is copy or sample data in the end user's own words; nothing here is
 * an address the model invented — `target` is filled by code.
 */
export interface LandingGatePlan {
  /** The key end-user story's code — never rendered. */
  story: string
  /** Entrypoint ALIAS of the story's full-scale screen in the user area (filled by code, not the model). */
  target?: string
  /** The question the gate asks, in the end user's words: "What's in your pantry?". */
  question: string
  /** The reassurance beside it: "No account needed". */
  hint: string
  /** The accessible name of the chip group: "Your pantry". */
  label: string
  /** 5–8 chip labels the guest picks from. */
  inputs: string[]
  /** 4–5 of `inputs`, pre-selected so the first view already shows results. */
  selected: string[]
  /** 3–4 sample records; `needs` is the subset of `inputs` each one uses. */
  results: { title: string, meta: string, needs: string[] }[]
  /** The live count label; `{n}` is replaced by the number ("{n} bakes match"). */
  count: { one: string, many: string, none: string }
  /** The line shown when nothing matches the picks. */
  empty: string
  /** The line beside the CTA: "Sign in with your email. Your picks come with you.". */
  note: string
  /** The CTA label: "Open recipes →". */
  cta: string
  /** The accessible name of a result row's lock icon: "Full method after sign-in". */
  lock: string
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
