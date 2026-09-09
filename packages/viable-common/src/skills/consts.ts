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

  LayoutDefinition = 'layout-definition',
  ScreenDefinition = 'screen-definition',

  LibrariesCommon = 'libraries-common',
  LibrariesUiState = 'libraries-ui-state',
  LibrariesUi = 'libraries-ui',
  LibrariesBackend = 'libraries-backend',
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
  [ViableSkill.LayoutDefinition]: 80,
  [ViableSkill.ScreenDefinition]: 82,
  [ViableSkill.LibrariesCommon]: 90,
  [ViableSkill.LibrariesUiState]: 90,
  [ViableSkill.LibrariesUi]: 90,
  [ViableSkill.LibrariesBackend]: 90,
}
