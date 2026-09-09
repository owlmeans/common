
export enum SpecCategory {
  BA = 'ba',
  UX = 'ux',
  UI = 'ui'
}

/**
 * The four screens that hold a flow together.
 *
 * A flow step acts on ONE record and never says how its actor reached it — which of the hundreds
 * waiting for them they opened, where they saw it was waiting at all, or where they look afterwards
 * to find out what became of it. These are the four shapes that answer that question.
 *
 * The taxonomy is CLOSED on purpose: a kind nothing derives is a screen nobody asked for, and every
 * story here costs a full develop run the project's owner pays for.
 */
export enum ConnectingStoryKind {
  /** The list of records waiting for THIS actor to perform their step. Derived from a hand-off. */
  Queue = 'queue',
  /** The directory of a kind of record, where an actor finds and opens the one they mean. */
  Index = 'index',
  /** One record gathered — what has happened to it, and the flow actions that start from it. */
  Record = 'record',
  /** An actor's own submissions and the state each reached. The sending side of a hand-off. */
  Tracker = 'tracker',
}

/**
 * Which half of the analysis a story came from.
 *
 * `flow` stories implement the numbered steps of the main flow — each adds value to one record.
 * `connective` stories are what a person needs to get from one step to the next. Neither is
 * persisted: the init pipeline is the only thing that has ever needed to tell them apart, and it
 * knows at creation time.
 */
export enum StoryKind {
  Flow = 'flow',
  Connective = 'connective',
}
