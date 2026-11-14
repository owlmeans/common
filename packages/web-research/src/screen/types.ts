import type { ScreenTextKind } from '../consts.js'
import type { InjectionSignalKind } from './consts.js'

/** One reason the pass flagged a text, with what it saw. */
export interface InjectionSignal {
  kind: InjectionSignalKind
  excerpt: string
}

export interface InjectionSignalOptions {
  /**
   * What the text is. `html` leaves scripts, styles and templates out before the pass — no reader of
   * the page sees them. Absent, the text is read exactly as given.
   */
  kind?: ScreenTextKind
  /** Text the document carries but hides from its reader (a hidden Word run) — each long one is a signal. */
  hidden?: readonly string[]
}

/**
 * The deterministic hidden-instruction pass — pure, no model: invisible and tag characters, bidi
 * controls, prose in comments and hidden elements, hidden runs, text addressed to an AI, and orders
 * that try to replace a model's instructions. Each signal once (`kind` + excerpt).
 */
export interface InjectionSignalsHelper {
  signals: (text: string, options?: InjectionSignalOptions) => InjectionSignal[]
  /** The text the pass reads — for `html`, without scripts, styles and templates; what a judge is shown. */
  readable: (text: string, kind?: ScreenTextKind) => string
  /** Whether a set of signals holds one of `strong` (`STRONG_SIGNAL_KINDS` by default). */
  strong: (signals: readonly InjectionSignal[], strong?: readonly InjectionSignalKind[]) => boolean
}

/** What a judge is told about the source it reads. */
export interface ScreenContext {
  /** Where the source came from. */
  url: string
  title?: string
  /** What the research reads the source for — one line. */
  purpose: string
}

export interface ScreenJudgement {
  /** The source gives orders to the AI agents reading it. */
  injected: boolean
  reason?: string
  /** The verbatim sentence carrying the order, when one was quoted. */
  quote?: string
}

/**
 * The model judgement over a flagged source — a port. `makeResearchJudge(models)` is the shipped one;
 * without any, a source with a strong signal is dropped and one with weak signals kept and noted. A
 * judge that throws is treated as absent for that source.
 */
export interface ResearchScreen {
  judge: (text: string, signals: readonly InjectionSignal[], context: ScreenContext) => Promise<ScreenJudgement>
}
