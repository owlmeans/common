/**
 * Aliases of the skills viable registers on the prompt service.
 *
 * A skill is a named, reusable block of system-prompt knowledge. Roles reference these
 * aliases instead of pasting the text, which is what stopped the same entrypoint and
 * resource-layer rules from living in four different helper files at once.
 */
export enum ViableSkill {
  /** Answer with source code and nothing else. */
  OutputSourceOnly = 'output-source-only',
  /** Answer with prose and nothing else. */
  OutputTextOnly = 'output-text-only',
  /** Build only what was asked for. */
  ScopeDiscipline = 'scope-discipline',
  /** One key user, one shortest path to value — for every analysis-stage helper. */
  MainFlowFocus = 'main-flow-focus',
  /** Overrides the TypeScript rules for a file that is not TypeScript. */
  NonTypescriptOutput = 'non-typescript-output',

  TsStyle = 'ts-style',
  TsImports = 'ts-imports',

  ReactComponents = 'react-components',
  OwlMeansEntrypoints = 'owlmeans-entrypoints',
  OwlMeansNav = 'owlmeans-nav',
  /** How one permission has to line up across the gate, the definition and the grant. */
  PermissionModel = 'permission-model',
  ShadcnUi = 'shadcn-ui',
  OwlmeansState = 'owlmeans-state',
  /** What an action says when it worked, what it says when it did not, and where it leaves you. */
  FormFeedback = 'form-feedback',
  StoreAccess = 'store-access',
  ViewModelNaming = 'viewmodel-naming',

  ResourceLayer = 'resource-layer',
  ResourceResults = 'resource-results',
  ResourceMigrations = 'resource-migrations',
  OwlMeansServer = 'owlmeans-server',
  OwlmeansContext = 'owlmeans-context',
  OwlMeansServices = 'owlmeans-services',
  FixerHeuristics = 'fixer-heuristics',

  ProjectLayout = 'project-layout',
  AgentTooling = 'agent-tooling',

  /** When work belongs off the request path — and, far more often, when it does not. */
  QueueDiscipline = 'queue-discipline',
  /** Writing a queue declaration, a job entrypoint and a processor that agree. */
  WorkerJobs = 'worker-jobs',
  /** Generating an @owlmeans/agent agent or pipeline INTO the application. */
  TargetAgents = 'target-agents',

  /** Whether a model call, a fixed pipeline or a tool-using agent is the right shape. */
  AgenticChoice = 'agentic-choice',
  /** Making a single model call from inside the generated application. */
  TargetLlm = 'target-llm',
  /** Giving the application's own agent its tools and its own installed skills. */
  TargetAgentTools = 'target-agent-tools',

  /** What a game brief is made of, and what it is not. */
  GameDesign = 'game-design',
  /** The three.js scene component — renderer, camera, loop, disposal. */
  GameScene = 'game-scene',
  /** Every control is an ordinary React component ABOVE the canvas, never inside it. */
  GameUi = 'game-ui',
  /** Casual, turn-based online and live online — and who owns the state in each. */
  GameNetworking = 'game-networking',

  LayoutDefinition = 'layout-definition',
  ScreenDefinition = 'screen-definition',

  LibrariesCommon = 'libraries-common',
  LibrariesUiState = 'libraries-ui-state',
  LibrariesUi = 'libraries-ui',
  LibrariesBackend = 'libraries-backend',
  LibrariesAi = 'libraries-ai',
  LibrariesGame = 'libraries-game',
}

/**
 * Sort weights. Skills render in this order inside the cached block, so the sequence is
 * part of the cache key — reordering them invalidates every prefix at once. Grouped in
 * tens to leave room for a consumer's own skills between them.
 */
export const SKILL_ORDER: Record<ViableSkill, number> = {
  [ViableSkill.OutputSourceOnly]: 10,
  [ViableSkill.OutputTextOnly]: 10,
  [ViableSkill.ScopeDiscipline]: 15,
  [ViableSkill.MainFlowFocus]: 12,
  [ViableSkill.NonTypescriptOutput]: 18,
  [ViableSkill.TsStyle]: 20,
  [ViableSkill.TsImports]: 30,
  [ViableSkill.ReactComponents]: 40,
  [ViableSkill.OwlMeansEntrypoints]: 41,
  [ViableSkill.OwlMeansNav]: 42,
  [ViableSkill.PermissionModel]: 43,
  [ViableSkill.ShadcnUi]: 44,
  [ViableSkill.OwlmeansState]: 50,
  [ViableSkill.FormFeedback]: 51,
  [ViableSkill.StoreAccess]: 52,
  [ViableSkill.ViewModelNaming]: 55,
  [ViableSkill.ResourceLayer]: 60,
  [ViableSkill.ResourceResults]: 62,
  [ViableSkill.ResourceMigrations]: 64,
  [ViableSkill.OwlMeansServer]: 70,
  [ViableSkill.OwlmeansContext]: 65,
  [ViableSkill.OwlMeansServices]: 66,
  [ViableSkill.FixerHeuristics]: 75,
  [ViableSkill.ProjectLayout]: 5,
  [ViableSkill.AgentTooling]: 8,
  [ViableSkill.QueueDiscipline]: 67,
  [ViableSkill.WorkerJobs]: 68,
  [ViableSkill.TargetAgents]: 69,
  [ViableSkill.AgenticChoice]: 71,
  [ViableSkill.TargetLlm]: 72,
  [ViableSkill.TargetAgentTools]: 73,
  [ViableSkill.GameDesign]: 45,
  [ViableSkill.GameScene]: 46,
  [ViableSkill.GameUi]: 47,
  [ViableSkill.GameNetworking]: 48,
  [ViableSkill.LayoutDefinition]: 80,
  [ViableSkill.ScreenDefinition]: 82,
  [ViableSkill.LibrariesCommon]: 90,
  [ViableSkill.LibrariesUiState]: 90,
  [ViableSkill.LibrariesUi]: 90,
  [ViableSkill.LibrariesBackend]: 90,
  [ViableSkill.LibrariesAi]: 90,
  [ViableSkill.LibrariesGame]: 90,
}

/**
 * The catalogue entries whose subject a PUBLISHED `@owlmeans` package already documents.
 *
 * The catalogue and `agent-meta/skills/*` state the same contract twice — the P1 duplication —
 * and the duplication is not symmetric: a package skill is versioned with the package and reaches
 * a prompt through `owlmeansPackagesPlugin` whenever the request names that package, while a
 * catalogue entry is a constant here that has to be edited by hand every time the framework moves.
 *
 * Naming the overlap is what makes it a DATA decision instead of a code one. A blueprint lists
 * which of these its prompts carry, and a persona's skills are filtered against that list — so
 * dropping one is a line in a blueprint, and restoring it is the same line. Everything NOT in this
 * set is viable's own (output discipline, scope, the view-model convention, the fixer heuristics,
 * where files live) and always loads, because no published package documents it.
 *
 * The default blueprint currently lists every one of them: the reduction is a real change to what
 * a coder is told, and it is measured against a green end-to-end baseline rather than guessed.
 */
export const FRAMEWORK_OWNED_SKILLS: ViableSkill[] = [
  ViableSkill.ResourceLayer,
  ViableSkill.ResourceResults,
  ViableSkill.ResourceMigrations,
  ViableSkill.OwlmeansContext,
  ViableSkill.OwlMeansServices,
  ViableSkill.OwlMeansServer,
  ViableSkill.OwlMeansEntrypoints,
  ViableSkill.OwlMeansNav,
  ViableSkill.PermissionModel,
  ViableSkill.OwlmeansState,
  ViableSkill.StoreAccess,
  ViableSkill.ShadcnUi,
  ViableSkill.ReactComponents,
  ViableSkill.FormFeedback,
]

const FRAMEWORK_OWNED = new Set<ViableSkill>(FRAMEWORK_OWNED_SKILLS)

/**
 * Filter a persona's skills against what a blueprint asks for.
 *
 * A skill nobody owns always survives. A framework-owned one survives only while the blueprint
 * lists it — so a blueprint built on another persistence layer stops teaching the Postgres
 * resource contract without anybody editing a persona, and a blueprint that lists nothing at all
 * (the shape a test builds) is read as "everything", because an empty allow-list almost always
 * means "not stated" rather than "none".
 */
export const skillsForBlueprint = (
  skills: ViableSkill[], allowed?: ViableSkill[]
): ViableSkill[] => {
  if (allowed == null || allowed.length === 0) return skills
  const permitted = new Set(allowed)

  return skills.filter(skill => !FRAMEWORK_OWNED.has(skill) || permitted.has(skill))
}
