import type { z } from 'zod'
import type { McpToolAnswer, ToolAnnotations, ToolDefinition, ToolHost } from '../types.js'

/**
 * How one kind of host presents the catalogue — a store listing, a vendor's plugin — as PURE DATA
 * plus small functions; the mechanics that apply it live in `makeToolProfileModel`.
 *
 * A host with no profile offers the catalogue exactly as it always has, byte for byte.
 */
export interface ToolProfile {
  name: string
  /** Built-in or extension tool names never offered under this profile. */
  hidden: readonly string[]
  /** Multi-action tools offered as one tool per action instead (the original name is then hidden). */
  splits: readonly ToolSplit[]
  /** Per tool (base or split-variant name): presentation overrides and the declared structured output. */
  presentation: Readonly<Record<string, ToolPresentation>>
  /** Server instructions for this profile, given the host and the names actually offered. */
  instructions: (input: ProfileInstructionsInput) => string
  /** session_status appends how the platform sees this connection (ConnectorApi.client()). */
  reportClient: boolean
  /**
   * Rewrites a text the profile answers or notifies — a reference to a split or hidden tool turned
   * into the names it offers, wording the listing may not carry (a billing address) taken out. Given
   * the answering tool's name (absent for a notification). Absent, every text is answered as it is.
   */
  text?: ToolProfileText
}

/** A profile's text rewrite: the text, and the tool answering it when there is one. */
export interface ToolProfileText {
  (text: string, tool?: string): string
}

/** One multi-action tool, offered as one tool per value of its action argument. */
export interface ToolSplit {
  /** The base tool's name — hidden once it is split. */
  tool: string
  /** The argument whose value picks the action (`action`). */
  argument: string
  variants: readonly ToolSplitVariant[]
}

/** One action of a split tool, as a tool of its own. */
export interface ToolSplitVariant {
  name: string
  /** The value the variant fixes its base's {@link ToolSplit.argument} to. */
  value: string
  title: string
  description: string
  /** Input fields of the base tool this action takes (the split argument is never offered). */
  fields: readonly string[]
  annotations: ToolAnnotations
}

export interface ToolPresentation {
  title?: string
  description?: string
  annotations?: ToolAnnotations
  /** Zod raw shape of structuredContent. Under a profile a tool returns structuredContent ONLY when it
   *  declares `output` (else the structured part is dropped and the text stays). */
  output?: z.ZodRawShape
  /** Base structured result (+ call args) → the declared shape: no internal ids/timestamps unless a
   *  follow-up call needs them. Must always produce a value the `output` schema accepts. */
  present?: (structured: object, args: Record<string, unknown>) => object
}

export interface ProfileInstructionsInput {
  host: ToolHost
  offered: readonly string[]
}

/** What `makeListingProfile` takes: everything beyond the listing's own hidden set and defaults. */
export interface ListingProfileOptions {
  name: string
  /** Hidden beyond `LISTING_HIDDEN`. */
  hidden?: readonly string[]
  splits?: readonly ToolSplit[]
  presentation?: Readonly<Record<string, ToolPresentation>>
  /** The profile's own instructions; absent, the listing's (the base text naming only offered tools). */
  instructions?: (input: ProfileInstructionsInput) => string
  /**
   * What the listing's instructions open with instead of the base text's first paragraph, given the
   * host. Absent, the base opening stays (without the recommendation).
   */
  preface?: (host: ToolHost) => string
  /** The profile's text rewrite; absent, the listing's own (`makeListingTextHelper` over its splits). */
  text?: ToolProfileText
  /** `true` when absent. */
  reportClient?: boolean
}

/**
 * A profile applied — or none, where every member is the identity, so a host without a profile
 * offers, names and answers exactly what it always did.
 */
export interface ToolProfileModel {
  /** The profile this model applies; `null` for a host that has none. */
  readonly profile: ToolProfile | null
  /**
   * The tools offered under the profile, in catalogue order: hidden ones removed, each split tool
   * replaced IN PLACE by its variants, title / description / annotations / `output` applied, and each
   * tool's run answering the declared structured shape (or none).
   */
  apply: (tools: readonly ToolDefinition[]) => ToolDefinition[]
  /**
   * The names a catalogue tool name stands for under the profile — what a group, pipeline or
   * instruction that names it should name instead: none when hidden, the variants when split, itself
   * otherwise.
   */
  namesOf: (tool: string) => string[]
  /**
   * The presentation a tool name answers with: its own entry; a split variant also inherits its base
   * tool's `output` and `present` unless its own entry declares an `output` (a base presenter is never
   * paired with a variant's own schema). `undefined` when there is none or no profile.
   */
  presentationOf: (tool: string) => ToolPresentation | undefined
  /**
   * A tool's answer under the profile: an error, or a tool that declares no `output`, keeps only its
   * text; a successful answer of a declared one ALWAYS carries structured content —
   * `present(structured ?? {}, args)` (`args` with a variant's fixed action) or, without a presenter,
   * `structured ?? {}` — since the MCP server refuses a success without it. The answer itself without
   * a profile. A presenter that throws propagates (`registerCatalogue` answers the text as an error).
   */
  answer: (tool: string, answer: McpToolAnswer, args: Record<string, unknown>) => McpToolAnswer
  /**
   * A text as the profile says it ({@link ToolProfile.text}); the text itself without a profile or a
   * rewrite. `answer` applies it to every text part and — when the profile has a rewrite — to every
   * string of the structured part; a host applies it to what it notifies out of band.
   */
  text: (text: string, tool?: string) => string
}
