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
  /**
   * The landing gate: a guest starts the key end-user story on the landing page and continues on
   * its full-scale screen after signing in, with the choices carried over.
   */
  LandingGate = 'landing-gate',

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

  /** The marketing-consent ledger: the 8 standard keys, never build a custom consent UI, check
   * the RECIPIENT's grant server-side before a send or a share. */
  MarketingConsent = 'marketing-consent',

  LibrariesCommon = 'libraries-common',
  LibrariesUiState = 'libraries-ui-state',
  LibrariesUi = 'libraries-ui',
  LibrariesBackend = 'libraries-backend',
  LibrariesAi = 'libraries-ai',
  LibrariesGame = 'libraries-game',
}

/**
 * Who the model is being asked to be.
 *
 * A persona is per HELPER, not per model role: `ModelRole` selects which model answers,
 * this selects what it is told it does. Two helpers can share a model and need different
 * personas, and the same persona can run on a cheap or an expensive model depending on
 * the effort tier — keeping the two axes separate is what makes that possible.
 */
export enum ViablePersona {
  BusinessAnalyst = 'business-analyst',
  ProductNaming = 'product-naming',
  /** Decides what KIND of product a prompt describes — which blueprint case builds it. */
  ProductArchitect = 'product-architect',
  UxDesigner = 'ux-designer',
  VisualDesigner = 'visual-designer',

  LayoutArchitect = 'layout-architect',
  ComponentArchitect = 'component-architect',
  StateArchitect = 'state-architect',
  NavigationArchitect = 'navigation-architect',
  DomainTypesArchitect = 'domain-types-architect',
  AccessArchitect = 'access-architect',
  ApiArchitect = 'api-architect',
  DatalayerArchitect = 'datalayer-architect',
  BackendDomainArchitect = 'backend-domain-architect',

  CommonCoder = 'common-coder',
  UiStateCoder = 'ui-state-coder',
  UiViewCoder = 'ui-view-coder',
  UiNavCoder = 'ui-nav-coder',
  DatalayerCoder = 'datalayer-coder',
  ApiCoder = 'api-coder',
  BackendModelCoder = 'backend-model-coder',
  /** Decides whether a story needs a queue, a worker or an agent — and usually decides it does not. */
  RuntimeArchitect = 'runtime-architect',
  /** Writes queue declarations, job processors and the application's own agents. */
  WorkerCoder = 'worker-coder',
  FreeFlightCoder = 'free-flight-coder',

  Fixer = 'fixer',
  Orchestrator = 'orchestrator',
  SourceExtractor = 'source-extractor',
  DeclarationLookup = 'declaration-lookup',
  FixAgent = 'fix-agent',
}
