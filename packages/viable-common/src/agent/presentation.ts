
import { agentLoopActions, codeActions, documentActions, structuredActions } from './consts.local.js'
import { AgentCodeLanguage, AgentMarkdownKind, AgentMessageCategory, AgentMessageRole, AgentStructuredKind } from './consts.js'
import type { RecordValue } from './types.local.js'
import type { AgentMessageClassificationInput, AgentMessagePresentation } from './types.js'
import type { AgentPresentationHelper } from './presentation/types.js'

export const createAgentPresentationHelper = (): AgentPresentationHelper => {
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
  const isAgentMessageHidden = (input: AgentMessageClassificationInput): boolean =>
    actionOf(input) === 'source-extract'

  /** Maps the attribution that reached the event boundary to the visual specialist family. */
  const agentMessageRoleOf = (input: AgentMessageClassificationInput): AgentMessageRole => {
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
  const agentToolCallArguments = (value: unknown): unknown => {
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

    // Checked ahead of the single-array shapes below: a scaffold plan carries its own `stories`
    // array (so the StoryPlan check would otherwise swallow it), and a runtime decision straight
    // from the MODEL never carries `actor`/`worker` — those are added only once the decision is
    // persisted onto a StoryDesign — so requiring them here missed every live model call.
    if ('identity' in object && 'guestHome' in object && 'areas' in object && 'stories' in object) {
      return AgentStructuredKind.ScaffoldPlan
    }
    if (Array.isArray(object.jobs) && Array.isArray(object.agents) && 'kv' in object) {
      return AgentStructuredKind.RuntimeDecision
    }

    if (Array.isArray(object.files)) return AgentStructuredKind.ArtifactSelection
    if (Array.isArray(object.entities)) return AgentStructuredKind.EntitySelection
    if (Array.isArray(object.stories)) return AgentStructuredKind.StoryPlan
    if (Array.isArray(object.screens)) return AgentStructuredKind.ScreenPlan
    if (Array.isArray(object.components)) return AgentStructuredKind.ComponentPlan
    if (Array.isArray(object.transitions)) return AgentStructuredKind.TransitionPlan
    if (Array.isArray(object.entries)) return AgentStructuredKind.EntrypointSelection
    if (Array.isArray(object.candidates)) return AgentStructuredKind.CandidateRanking
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
  const agentDiffLanguageOf = (text: string): AgentCodeLanguage => {
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
  const agentCodeLanguageOf = (text: string): AgentCodeLanguage => {
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

  const isUnifiedDiff = (text: string): boolean =>
    /^---\s+.+\n\+\+\+\s+.+/m.test(text) || (/^@@\s+[-+]/m.test(text) && /^(?:\+|-)[^+-]/m.test(text))

  const markdownKindOf = (text: string): AgentMarkdownKind | undefined => {
    if (/^#{1,6}\s+/m.test(text) || /^>\s+/m.test(text) || /^\|.+\|\s*$/m.test(text)) {
      return AgentMarkdownKind.Documentation
    }
    const listItems = text.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm)?.length ?? 0
    return listItems >= 2 ? AgentMarkdownKind.Documentation : undefined
  }

  const isGenericStructure = (kind: AgentStructuredKind | undefined): boolean =>
    kind == null || kind === AgentStructuredKind.GenericRecord || kind === AgentStructuredKind.GenericList ||
    kind === AgentStructuredKind.GenericValue

  const classifyAgentMessage = (input: AgentMessageClassificationInput): AgentMessagePresentation => {
    const role = agentMessageRoleOf(input)
    const action = actionOf(input)
    const text = contentOf(input)
    const structure = structuredKindOf(input.value)

    if (input.outputType === 'tool_calls') {
      // A single pinned-schema call resolves to its own card; everything else — several calls in
      // one turn, an unconstrained agent-loop action, or a shape too generic to be informative —
      // is a tool call, not a schema result.
      const isMultiCall = Array.isArray(input.value) && input.value.length > 1
      const isToolCalls = isMultiCall || agentLoopActions.has(action) || isGenericStructure(structure)
      return {
        category: AgentMessageCategory.Structured,
        structure: isToolCalls ? AgentStructuredKind.ToolCalls : structure!,
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

  return {
    isAgentMessageHidden, agentMessageRoleOf, agentToolCallArguments, agentDiffLanguageOf, agentCodeLanguageOf,
    isUnifiedDiff, classifyAgentMessage,
  }
}

export const agentPresentationHelper = createAgentPresentationHelper()

/** @deprecated compat:factory-refactor — use `agentPresentationHelper.isAgentMessageHidden(…)` */
export const isAgentMessageHidden = (input: AgentMessageClassificationInput): boolean =>
  agentPresentationHelper.isAgentMessageHidden(input)

/** @deprecated compat:factory-refactor — use `agentPresentationHelper.agentMessageRoleOf(…)` */
export const agentMessageRoleOf = (input: AgentMessageClassificationInput): AgentMessageRole =>
  agentPresentationHelper.agentMessageRoleOf(input)

/** @deprecated compat:factory-refactor — use `agentPresentationHelper.agentToolCallArguments(…)` */
export const agentToolCallArguments = (value: unknown): unknown => agentPresentationHelper.agentToolCallArguments(value)

/** @deprecated compat:factory-refactor — use `agentPresentationHelper.agentDiffLanguageOf(…)` */
export const agentDiffLanguageOf = (text: string): AgentCodeLanguage => agentPresentationHelper.agentDiffLanguageOf(text)

/** @deprecated compat:factory-refactor — use `agentPresentationHelper.agentCodeLanguageOf(…)` */
export const agentCodeLanguageOf = (text: string): AgentCodeLanguage => agentPresentationHelper.agentCodeLanguageOf(text)

/** @deprecated compat:factory-refactor — use `agentPresentationHelper.isUnifiedDiff(…)` */
export const isUnifiedDiff = (text: string): boolean => agentPresentationHelper.isUnifiedDiff(text)

/** @deprecated compat:factory-refactor — use `agentPresentationHelper.classifyAgentMessage(…)` */
export const classifyAgentMessage = (input: AgentMessageClassificationInput): AgentMessagePresentation =>
  agentPresentationHelper.classifyAgentMessage(input)
