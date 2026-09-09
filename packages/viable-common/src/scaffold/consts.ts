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
