import type { BentoFragmentKind, LandingGateFieldKind } from './types.js'

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
