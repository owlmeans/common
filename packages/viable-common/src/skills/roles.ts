
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
