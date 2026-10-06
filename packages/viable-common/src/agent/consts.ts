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
