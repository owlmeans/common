import { AgentMarkdownKind, AgentStructuredKind } from './consts.js'

export const documentActions: Record<string, AgentMarkdownKind> = {
  'write-specification': AgentMarkdownKind.Specification,
  'summarize-specification': AgentMarkdownKind.Specification,
  'write-design-concept': AgentMarkdownKind.DesignDocument,
  'describe-ui-component': AgentMarkdownKind.DesignDocument,
  'describe-ui-screen': AgentMarkdownKind.DesignDocument,
  'describe-ui-layout': AgentMarkdownKind.DesignDocument,
}

export const codeActions = new Set(['code', 'update-code', 'update-code-full'])

/**
 * The model's schema makes the final output self-describing; while it streams, the helper action
 * gives the client the same semantic cue before a complete JSON value exists.
 */
export const structuredActions: Record<string, AgentStructuredKind> = {
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

/**
 * Classifies known model output by source AND shape. The `value` comes from a caller's JSON
 * parser; this runtime-free package intentionally never repairs or parses streamed JSON itself.
 */
/**
 * Actions run by an unconstrained tool-calling loop (the coding agent, the repair/architect/
 * lookup sub-agents, source extraction) rather than a single pinned-schema call. Their tool calls
 * are file/shell operations, not model-schema output, so they always render as ToolCalls even
 * when a call's arguments happen to shape-match a schema kind — `read_sources({ files })` looks
 * exactly like an ArtifactSelection.
 */
export const agentLoopActions = new Set([
  'coding-agent-ask', 'arbitrary-modification', 'fix-agent', 'architect', 'declaration-lookup',
  'source-extract',
])
