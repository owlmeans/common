import type {
  BentoFragmentKind, LandingAnchor, LandingBand, LandingGateFieldKind, LandingSlot,
} from './types.js'

/**
 * The shapes a drawn widget can take.
 *
 * A CLOSED set, and deliberately small: each value maps to one pre-built sketch primitive in the
 * target's template, so a value nothing can draw is a value that produces a blank card. A story
 * whose shape is none of these is a list — the commonest thing a screen is, and the safest
 * placeholder for anything unrecognised.
 */
export enum WidgetKind {
  /** A queue, an index, a feed — records one after another. */
  List = 'list',
  /** Records in columns, the shape a back office mostly takes. */
  Table = 'table',
  /** The actor SUBMITS something. */
  Form = 'form',
  /** A trend or a comparison over time. */
  Chart = 'chart',
  /** Headline figures — a summary, a tracker, a status board. */
  Stat = 'stat',
}

/** How many of an area's widgets may be adapted onto its home screen. */
export const AREA_HOME_WIDGET_CAP = 3

/** Sections per area beyond which a top menu stops being navigable. */
export const AREA_SECTION_CAP = 6

/**
 * The shapes a landing page's bento fragment can take.
 *
 * A closed set for the same reason as {@link WidgetKind}: each value is one stamped primitive, so a
 * value nothing can draw is a tile with an empty bottom.
 */
export const BENTO_FRAGMENT_KINDS: BentoFragmentKind[] = ['list', 'note', 'people', 'steps']

/**
 * The controls a landing-gate field can be — the simplest native inputs, and no picker of any
 * kind. A closed set for the same reason as {@link BENTO_FRAGMENT_KINDS}: each value is one plain
 * element the seed's gate knows how to draw.
 */
export const LANDING_GATE_FIELD_KINDS: LandingGateFieldKind[] = ['text', 'select', 'number', 'date']

/** The most fields a landing gate carries. A form longer than this is a screen, not an entry. */
export const LANDING_GATE_MAX_FIELDS = 3

/** The options a `select` field carries: fewer is no choice, more is a list to browse. */
export const LANDING_GATE_OPTIONS = { min: 2, max: 6 } as const

/**
 * The bands of a landing page in the HOUSE ORDER — the order every page draws them in, whichever
 * of them it carries. `problem` is the problem-and-solution band.
 */
export const LANDING_BAND_ORDER: LandingBand[] = [
  'hero', 'steps', 'features', 'use-cases', 'problem', 'differentiator', 'approach',
  'testimonials', 'about', 'closing',
]

/** The bands the guest header menu can jump to, in page order. */
export const LANDING_ANCHORS: LandingAnchor[] = [
  'how', 'features', 'use-cases', 'why', 'approach', 'community', 'about',
]

/** Which band each menu anchor jumps to. */
export const LANDING_ANCHOR_BAND: Record<LandingAnchor, LandingBand> = {
  how: 'steps',
  features: 'features',
  'use-cases': 'use-cases',
  why: 'differentiator',
  approach: 'approach',
  community: 'testimonials',
  about: 'about',
}

/**
 * The English menu labels an entry falls back to when neither the menu nor the page's own section
 * label names it. A fallback, never the intended copy: the plan writes labels in the product's
 * language.
 */
export const LANDING_ANCHOR_LABELS: Record<LandingAnchor, string> = {
  how: 'How it works',
  features: 'Features',
  'use-cases': 'Use cases',
  why: 'Why us',
  approach: 'How we work',
  community: 'Reviews',
  about: 'About',
}

/** Entries of the guest header menu: fewer is not a menu, more crowds a phone's header. */
export const LANDING_MENU = { min: 2, max: 4 } as const

/** Cases of the use-cases band; fewer than `min` and the band is not drawn. */
export const LANDING_USE_CASES = { min: 2, max: 4 } as const

/** Rows of the differentiator's usual-vs-ours contrast; fewer than `min` and no table is drawn. */
export const LANDING_CONTRAST = { min: 2, max: 3 } as const

/** Principles of the approach band; fewer than `min` and the band is not drawn. */
export const LANDING_PRINCIPLES = { min: 3, max: 4 } as const

/** Every button or link of a landing page that can open a user story, in page order. */
export const LANDING_SLOTS: LandingSlot[] = [
  'hero.cta', 'hero.secondary', 'hero.browse',
  'useCase.1', 'useCase.2', 'useCase.3', 'useCase.4',
  'closing.primary', 'closing.secondary', 'closing.link.1', 'closing.link.2',
]

/** The slots a landing gate replaces: with a usable gate the page draws none of them. */
export const LANDING_GATE_SLOTS: LandingSlot[] = ['hero.cta', 'hero.secondary', 'closing.primary']
