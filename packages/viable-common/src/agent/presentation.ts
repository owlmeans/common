/**
 * A compact, runtime-free description of how an agent message should be presented.
 *
 * The server emits this with thinking events and the browser refines it as streaming output
 * becomes parseable. Keeping the vocabulary here prevents the two runtimes from drifting into
 * their own guesses about the same model response.
 */
export enum AgentMessageCategory {
  Code = 'code',
  Diff = 'diff',
  Structured = 'structured',
  Markdown = 'markdown',
  Plain = 'plain',
}

export enum AgentCodeLanguage {
  ReactTsx = 'react-tsx',
  Css = 'css',
  TypeScript = 'typescript',
  Json = 'json',
  Other = 'other',
}

/** A semantic shape that the manager can render as a purpose-built card. */
export enum AgentStructuredKind {
  ToolCalls = 'tool-calls',
  ArtifactSelection = 'artifact-selection',
  EntitySelection = 'entity-selection',
  StoryPlan = 'story-plan',
  ScreenPlan = 'screen-plan',
  ComponentPlan = 'component-plan',
  TransitionPlan = 'transition-plan',
  EntrypointSelection = 'entrypoint-selection',
  AccessPolicy = 'access-policy',
  ScaffoldPlan = 'scaffold-plan',
  RuntimeDecision = 'runtime-decision',
  CandidateRanking = 'candidate-ranking',
  Decision = 'decision',
  GenericRecord = 'generic-record',
  GenericList = 'generic-list',
  GenericValue = 'generic-value',
}

export enum AgentMarkdownKind {
  Specification = 'specification',
  DesignDocument = 'design-document',
  Documentation = 'documentation',
}

/** The family of specialist that produced an output, not an authorization role. */
export enum AgentMessageRole {
  Technical = 'technical',
  Analytical = 'analytical',
  Product = 'product',
  Ux = 'ux',
  VisualDesign = 'visual-design',
  Architect = 'architect',
  Developer = 'developer',
  Repair = 'repair',
  Orchestrator = 'orchestrator',
}

export interface AgentCodePresentation {
  category: AgentMessageCategory.Code | AgentMessageCategory.Diff
  language: AgentCodeLanguage
  role: AgentMessageRole
}

export interface AgentStructuredPresentation {
  category: AgentMessageCategory.Structured
  structure: AgentStructuredKind
  role: AgentMessageRole
}

export interface AgentMarkdownPresentation {
  category: AgentMessageCategory.Markdown
  document: AgentMarkdownKind
  role: AgentMessageRole
}

export interface AgentPlainPresentation {
  category: AgentMessageCategory.Plain
  role: AgentMessageRole
}

export type AgentMessagePresentation =
  | AgentCodePresentation
  | AgentStructuredPresentation
  | AgentMarkdownPresentation
  | AgentPlainPresentation

/** The attribution and content available to either side of a thinking event. */
export interface AgentMessageClassificationInput {
  agent?: string
  helper?: string
  action?: string
  outputType?: string
  text?: string
  value?: unknown
}

type RecordValue = Record<string, unknown>

const documentActions: Record<string, AgentMarkdownKind> = {
  'write-specification': AgentMarkdownKind.Specification,
  'summarize-specification': AgentMarkdownKind.Specification,
  'write-design-concept': AgentMarkdownKind.DesignDocument,
  'describe-ui-component': AgentMarkdownKind.DesignDocument,
  'describe-ui-screen': AgentMarkdownKind.DesignDocument,
  'describe-ui-layout': AgentMarkdownKind.DesignDocument,
}

const codeActions = new Set(['code', 'update-code', 'update-code-full'])

/**
 * The model's schema makes the final output self-describing; while it streams, the helper action
 * gives the client the same semantic cue before a complete JSON value exists.
 */
const structuredActions: Record<string, AgentStructuredKind> = {
  'choose-files-for-fix': AgentStructuredKind.ArtifactSelection,
  'list-files-to-fix': AgentStructuredKind.ArtifactSelection,
  'extract-user-stories-from-spec': AgentStructuredKind.StoryPlan,
  'derive-connecting-stories': AgentStructuredKind.StoryPlan,
  'derive-area-scaffold-stories': AgentStructuredKind.StoryPlan,
  'describe-ux-story-transitions': AgentStructuredKind.TransitionPlan,
  'find-entrypoint-for-screen': AgentStructuredKind.EntrypointSelection,
  'describe-api-access': AgentStructuredKind.AccessPolicy,
  'describe-screen-access': AgentStructuredKind.AccessPolicy,
  'plan-scaffold': AgentStructuredKind.ScaffoldPlan,
  'runtime-gate': AgentStructuredKind.RuntimeDecision,
  'detect-story-with-home-screen': AgentStructuredKind.CandidateRanking,
}

const asRecord = (value: unknown): RecordValue | undefined =>
  value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : undefined

const actionOf = (input: AgentMessageClassificationInput): string => input.action?.toLowerCase() ?? ''

const sourceOf = (input: AgentMessageClassificationInput): string =>
  `${input.agent ?? ''} ${input.helper ?? ''}`.toLowerCase()

const contentOf = (input: AgentMessageClassificationInput): string => input.text?.trim() ?? ''

/**
 * Source extraction is an internal context-reduction pass. Its terminal tool call contains only
 * line ranges, which are useful to the coder but add no useful information to a person's journal.
 */
export const isAgentMessageHidden = (input: AgentMessageClassificationInput): boolean =>
  actionOf(input) === 'source-extract'

/** Maps the attribution that reached the event boundary to the visual specialist family. */
export const agentMessageRoleOf = (input: AgentMessageClassificationInput): AgentMessageRole => {
  const source = sourceOf(input)
  const action = actionOf(input)

  if (action === 'arbitrary-modification' || source.includes('orchestrator')) return AgentMessageRole.Orchestrator
  if (source.includes('fix')) return AgentMessageRole.Repair
  if (source.includes('coder') || source.includes('developer') || codeActions.has(action)) return AgentMessageRole.Developer
  if (source.includes('visual') || source.includes('ui-helper')) return AgentMessageRole.VisualDesign
  if (source.includes('ux-')) return AgentMessageRole.Ux
  if (source.includes('business') || source.includes('ba-') || source.includes('analysis') || source.includes('analyst')) return AgentMessageRole.Analytical
  if (source.includes('product') || source.includes('naming')) return AgentMessageRole.Product
  if (source.includes('architect') || source.includes('arch') || source.includes('layout-helper') ||
    source.includes('api-helper') || source.includes('access-helper') || source.includes('datalayer-helper') ||
    source.includes('domain') || source.includes('nav-helper') || source.includes('ui-com-helper') ||
    source.includes('ui-state-helper')) return AgentMessageRole.Architect
  return AgentMessageRole.Technical
}

/** Pulls a schema argument out of LangChain's serialised tool-call shape. */
export const agentToolCallArguments = (value: unknown): unknown => {
  if (!Array.isArray(value) || value.length !== 1) return value
  const call = asRecord(value[0])
  return call?.args ?? value
}

const structuredKindOf = (value: unknown): AgentStructuredKind | undefined => {
  if (value == null) return undefined

  const toolArgs = agentToolCallArguments(value)
  const object = asRecord(toolArgs)
  if (object == null) {
    if (Array.isArray(toolArgs)) return AgentStructuredKind.GenericList
    return undefined
  }

  if (Array.isArray(object.files)) return AgentStructuredKind.ArtifactSelection
  if (Array.isArray(object.entities)) return AgentStructuredKind.EntitySelection
  if (Array.isArray(object.stories)) return AgentStructuredKind.StoryPlan
  if (Array.isArray(object.screens)) return AgentStructuredKind.ScreenPlan
  if (Array.isArray(object.components)) return AgentStructuredKind.ComponentPlan
  if (Array.isArray(object.transitions)) return AgentStructuredKind.TransitionPlan
  if (Array.isArray(object.entries)) return AgentStructuredKind.EntrypointSelection
  if (Array.isArray(object.candidates)) return AgentStructuredKind.CandidateRanking
  if ('identity' in object && 'guestHome' in object && 'areas' in object && 'stories' in object) {
    return AgentStructuredKind.ScaffoldPlan
  }
  if ('actor' in object && 'worker' in object && 'jobs' in object && 'agents' in object && 'kv' in object) {
    return AgentStructuredKind.RuntimeDecision
  }
  if (Object.values(object).some(value => {
    const entry = asRecord(value)
    return entry != null && Array.isArray(entry.permissions) && 'level' in entry
  })) return AgentStructuredKind.AccessPolicy
  return AgentStructuredKind.GenericRecord
}

const decisionAction = (action: string): boolean =>
  action.startsWith('should-') || action.startsWith('is-') || action.includes('blueprint-case') || action.includes('choose-case')

const fileExtensionLanguage = (path: string): AgentCodeLanguage => {
  const name = path.toLowerCase().split('?')[0]
  if (/\.(tsx|jsx)$/.test(name)) return AgentCodeLanguage.ReactTsx
  if (/\.css$/.test(name)) return AgentCodeLanguage.Css
  if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(name)) return AgentCodeLanguage.TypeScript
  if (/\.json$/.test(name)) return AgentCodeLanguage.Json
  return AgentCodeLanguage.Other
}

/** Finds the language of a unified diff from its destination (or source) file path. */
export const agentDiffLanguageOf = (text: string): AgentCodeLanguage => {
  const match = text.match(/^\+\+\+\s+(?:b\/)?(.+)$/m) ?? text.match(/^---\s+(?:a\/)?(.+)$/m)
  return match == null ? AgentCodeLanguage.Other : fileExtensionLanguage(match[1])
}

const fencedLanguageOf = (text: string): AgentCodeLanguage | undefined => {
  const match = text.match(/^```([\w+-]+)/m)
  const language = match?.[1]?.toLowerCase()
  if (language == null) return undefined
  if (['tsx', 'jsx', 'react'].includes(language)) return AgentCodeLanguage.ReactTsx
  if (language === 'css') return AgentCodeLanguage.Css
  if (['ts', 'typescript', 'js', 'javascript'].includes(language)) return AgentCodeLanguage.TypeScript
  if (language === 'json') return AgentCodeLanguage.Json
  return AgentCodeLanguage.Other
}

/** Conservative code detection; prose with one identifier remains plain text. */
export const agentCodeLanguageOf = (text: string): AgentCodeLanguage => {
  const content = text.trim().replace(/^```[\w+-]*\n?|\n?```$/g, '')
  const fenced = fencedLanguageOf(text)
  if (fenced != null) return fenced
  if (content === '') return AgentCodeLanguage.Other
  try {
    JSON.parse(content)
    if (/^[{[]/.test(content)) return AgentCodeLanguage.Json
  } catch {
    // The remaining heuristics deliberately require source-like syntax.
  }
  if (/<[A-Za-z][\w.:-]*(?:\s[^>]*)?\/>|<[A-Za-z][\w.:-]*(?:\s[^>]*)?>/.test(content) &&
    /\b(import|export|const|function|return)\b/.test(content)) return AgentCodeLanguage.ReactTsx
  if (/(^|\n)\s*(?:[.#][\w-]+|[a-z][\w-]*(?:\[[^\]]+\])?)\s*\{[^}]*:[^}]*\}/.test(content)) {
    return AgentCodeLanguage.Css
  }
  if (/\b(import|export|interface|type|const|let|function|class)\b/.test(content) &&
    /[;{}]|=>/.test(content)) return AgentCodeLanguage.TypeScript
  return AgentCodeLanguage.Other
}

export const isUnifiedDiff = (text: string): boolean =>
  /^---\s+.+\n\+\+\+\s+.+/m.test(text) || (/^@@\s+[-+]/m.test(text) && /^(?:\+|-)[^+-]/m.test(text))

const markdownKindOf = (text: string): AgentMarkdownKind | undefined => {
  if (/^#{1,6}\s+/m.test(text) || /^>\s+/m.test(text) || /^\|.+\|\s*$/m.test(text)) {
    return AgentMarkdownKind.Documentation
  }
  const listItems = text.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm)?.length ?? 0
  return listItems >= 2 ? AgentMarkdownKind.Documentation : undefined
}

/**
 * Classifies known model output by source AND shape. The `value` comes from a caller's JSON
 * parser; this runtime-free package intentionally never repairs or parses streamed JSON itself.
 */
export const classifyAgentMessage = (input: AgentMessageClassificationInput): AgentMessagePresentation => {
  const role = agentMessageRoleOf(input)
  const action = actionOf(input)
  const text = contentOf(input)
  const structure = structuredKindOf(input.value)

  if (input.outputType === 'tool_calls') {
    return {
      category: AgentMessageCategory.Structured,
      structure: structure ?? AgentStructuredKind.ToolCalls,
      role,
    }
  }
  if (structure != null) return { category: AgentMessageCategory.Structured, structure, role }
  const actionStructure = structuredActions[action]
  if (actionStructure != null) return { category: AgentMessageCategory.Structured, structure: actionStructure, role }
  if (decisionAction(action)) return { category: AgentMessageCategory.Structured, structure: AgentStructuredKind.Decision, role }
  if (isUnifiedDiff(text) || action === 'update-code') {
    return { category: AgentMessageCategory.Diff, language: agentDiffLanguageOf(text), role }
  }
  if (codeActions.has(action) || fencedLanguageOf(text) != null || agentCodeLanguageOf(text) !== AgentCodeLanguage.Other) {
    return { category: AgentMessageCategory.Code, language: agentCodeLanguageOf(text), role }
  }
  const document = documentActions[action] ?? markdownKindOf(text)
  if (document != null) return { category: AgentMessageCategory.Markdown, document, role }
  if (input.value != null) {
    return {
      category: AgentMessageCategory.Structured,
      structure: Array.isArray(input.value) ? AgentStructuredKind.GenericList : AgentStructuredKind.GenericValue,
      role,
    }
  }
  return { category: AgentMessageCategory.Plain, role }
}
