import type { CollectLimits } from '@owlmeans/llm-reader'
import type { ResearchLimits } from './types.js'

/** The model roles research work runs at — each a separate helper execution, its own model alias by default. */
export enum ResearchRole {
  /** Plans searches, writes the implementation report, the project summary and reads a design. */
  Analyst = 'analyst',
  /** Writes package usage notes and skills. */
  Writer = 'writer',
  /** Short digests of long material. */
  Summarizer = 'summarizer',
  /** Decides whether a flagged source carries instructions to the agents reading it. */
  Judge = 'judge',
}

/** The pipeline aliases — `research:` because a run row is addressed by `<alias>:<runId>` in a shared store. */
export enum ResearchPipeline {
  Implementation = 'research:implementation',
  Project = 'research:project',
  Design = 'research:design',
  Packages = 'research:packages',
  Skill = 'research:skill',
}

/** `research:implementation` step ids, in spec order. */
export enum ImplementationStep {
  Plan = 'plan',
  Search = 'search',
  Collect = 'collect',
  Screen = 'screen',
  Synthesize = 'synthesize',
  Cleanup = 'cleanup',
}

/** `research:project` step ids, in spec order. */
export enum ProjectStep {
  Crawl = 'crawl',
  Screen = 'screen',
  Summarize = 'summarize',
  Cleanup = 'cleanup',
}

/** `research:design` step ids, in spec order. */
export enum DesignStep {
  Collect = 'collect',
  Analyze = 'analyze',
  Pack = 'pack',
  Cleanup = 'cleanup',
}

/** `research:packages` step ids, in spec order. */
export enum PackagesStep {
  Inspect = 'inspect',
  Read = 'read',
  Screen = 'screen',
  Notes = 'notes',
  Cleanup = 'cleanup',
}

/** `research:skill` step ids, in spec order. `notes` runs `research:packages` as a child when no notes are given. */
export enum SkillStep {
  Notes = 'notes',
  Write = 'write',
  Validate = 'validate',
  Cleanup = 'cleanup',
}

/** Why a research output is thinner than asked — recorded, never thrown. */
export enum ResearchGapCode {
  /** No search port: implementation research writes no report. */
  SearchUnavailable = 'search-unavailable',
  /** One search failed; the others went on. */
  SearchFailed = 'search-failed',
  /** The searches named no page that could be opened. */
  NoCandidates = 'no-candidates',
  /** A page or file could not be cloned (refused, failed, a status). */
  SourceFailed = 'source-failed',
  /** A cloned file carries no text a model could read (a PDF, an image). */
  SourceUnreadable = 'source-unreadable',
  /** A source carried instructions to the agents reading it and was dropped before synthesis. */
  SourceScreened = 'source-screened',
  /** A source showed weak hidden-instruction signals; kept, and noted. */
  SourceFlagged = 'source-flagged',
  /** Nothing usable survived: no report was written. */
  NoSources = 'no-sources',
  /** The inspector did not judge the package genuine: no notes, no skill. */
  NotGenuine = 'not-genuine',
  /** No inspector was wired: the packages pipeline judges nothing and writes nothing. */
  InspectorUnavailable = 'inspector-unavailable',
  /** The package's documentation site could not be read. */
  DocsUnavailable = 'docs-unavailable',
  /** The registry holds no readme for the package. */
  ReadmeMissing = 'readme-missing',
  /** The written text carries no citation. */
  Uncited = 'uncited',
  /** The design write-up failed or had no model: the measured facts were written alone. */
  DesignByFacts = 'design-by-facts',
  /** The design page could not be rendered and was parsed instead. */
  NotRendered = 'not-rendered',
}

/** What the screen decided about one source. */
export enum ScreenVerdict {
  /** No signal, or a judge that found no order. */
  Clean = 'clean',
  /** Weak signals only and no judge: kept, and noted. */
  Flagged = 'flagged',
  /** Instructions to the agents: removed before anything reads it. */
  Dropped = 'dropped',
}

/** How one source record ended. */
export enum SourceStatus {
  Ok = 'ok',
  Failed = 'failed',
  Unreadable = 'unreadable',
}

/** What kind of text a source's raw form is — decides how the signal pass reads it. */
export enum ScreenTextKind {
  /** Scripts, styles and templates are left out before the pass: no reader of the page sees them. */
  Html = 'html',
  Markdown = 'markdown',
  Text = 'text',
}

/** The folder of the source area every run's files live under, one sub-folder per run id segment. */
export const RESEARCH_RUNS_DIR = 'runs'

/** What implementation research clones of a page: the page itself, no stylesheets, fonts or pictures. */
export const IMPLEMENTATION_COLLECT_LIMITS: Readonly<Partial<CollectLimits>> = Object.freeze({
  maxFiles: 4,
  maxAssets: 0,
  maxFileBytes: 4 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
})

/** What design research clones of a page: the page with its stylesheets, fonts and pictures. */
export const DESIGN_COLLECT_LIMITS: Readonly<Partial<CollectLimits>> = Object.freeze({
  maxFiles: 80,
  maxAssets: 70,
  maxTotalBytes: 40 * 1024 * 1024,
})

/**
 * Every limit the pipelines apply — ceilings on what an input may ask for, and budgets on what is
 * fed to a model. Override any of them through `ResearchWiring.limits`.
 */
export const RESEARCH_LIMITS: Readonly<ResearchLimits> = Object.freeze({
  maxQueries: 3,
  maxResults: 5,
  collectSpare: 2,
  maxProjectPages: 8,
  maxProjectDepth: 2,
  maxPackages: 5,
  maxDocsPages: 6,
  docsDepth: 1,
  sourceChars: 40_000,
  promptTokens: 30_000,
  minSourceTokens: 200,
  contextChars: 6_000,
  instructionChars: 2_000,
  readmeChars: 30_000,
  notesChars: 60_000,
  skillChars: 12_000,
  judgeChars: 24_000,
  collectTimeoutMs: 60_000,
  implementationCollect: IMPLEMENTATION_COLLECT_LIMITS,
  designCollect: DESIGN_COLLECT_LIMITS,
  maxGaps: 40,
})

/** What a project crawl reads a site for. */
export const PROJECT_CRAWL_INTENT = 'product, features, pricing, docs, use cases, about'

/** What a package documentation crawl reads a site for. */
export const DOCS_CRAWL_INTENT = 'getting started, installation, API reference, usage, examples, migration'

/** A valid Agent Skills name. */
export const SKILL_NAME_PATTERN = /^[a-z0-9-]{1,64}$/

/** The longest skill `description` the Agent Skills standard accepts. */
export const SKILL_DESCRIPTION_CHARS = 1024
