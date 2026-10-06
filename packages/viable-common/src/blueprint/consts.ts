/**
 * The blueprint the platform ships and every project uses until something says otherwise.
 *
 * A string rather than an enum: a blueprint may be registered by a consumer, and an enum would
 * make the platform's own list the closed set of everything that can exist — which is the shape
 * this whole abstraction was introduced to remove.
 */
export const DEFAULT_BLUEPRINT_ID = 'owlmeans-fullstack-ts'

/** Recorded on a project so a later run knows which blueprint drew it. */
export const BLUEPRINT_META_KEY = 'blueprint'

/**
 * WHICH KIND of product is being built on a blueprint.
 *
 * A blueprint says what the STACK is — the language, the framework, the topology, the seeds. A
 * case says what is being built ON it, and that is a different question with different consumers:
 * the analyst framing the brief, the architect deciding whether a story needs a queue, the coder
 * choosing which packages it may import.
 *
 * Deliberately NOT a second blueprint. Everything a case has to say is already a blueprint field,
 * so a case is a PATCH and the resolution order stays base → case → per-run overrides. That is
 * also why adding one is a data change: nothing reads `BlueprintCase` except the case table
 * (`BLUEPRINT_CASES` in `@owlmeans/viable`) and the prompt that classifies a project into it.
 */
export enum BlueprintCase {
  /** A web application whose every feature fits inside a request. No queue, no worker, no agents. */
  Web = 'web',
  /** A web application with work that genuinely belongs off the request path. */
  Scalable = 'scalable',
  /** The product's value comes from ordered, deterministic model-driven steps. */
  AiPipeline = 'ai-pipeline',
  /** The product's value comes from an agent that decides its own path through tools. */
  AiAgent = 'ai-agent',
  /** A browser game: a three.js scene with an ordinary React interface over it. */
  Game = 'game',
  /**
   * Work management: the product's core is records of work people create and move through
   * statuses or a pipeline, built on the planning packages. Single organization.
   */
  WorkManagement = 'work-management',
  /**
   * Work management whose audiences work inside many organizations. Never classified directly:
   * code picks it from {@link WorkManagement} when the project's tenancy decision has a flag on.
   */
  WorkManagementTenanted = 'work-management-tenanted',
}

/**
 * How a game is played, which decides who owns its state.
 *
 * Recorded beside the case rather than folded into it, because it changes nothing about the
 * dependencies and everything about where the logic goes. `OnlineTurn` is the default for
 * anything multiplayer unless the brief plainly asks for live play — it is the shape that
 * actually builds, and it needs no socket, no tick loop and no reconciliation.
 */
export enum GameKind {
  Casual = 'casual',
  OnlineTurn = 'online-turn',
  OnlineLive = 'online-live',
}

/**
 * Which kind of work a work-management product keeps — read by the planning kit and the analysis.
 *
 * Recorded beside the case on the project card (`fields.workKind`), like {@link GameKind}: it
 * changes no dependency, only which ready-made card types and flows the product starts from.
 */
export enum WorkKind {
  /** Projects broken into tasks or issues moved across stages to done. */
  Project = 'project',
  /** Leads, contacts, accounts and opportunities through a sales pipeline. */
  Crm = 'crm',
  /** Requests become tickets assigned to agents and worked to resolution. */
  ServiceDesk = 'service-desk',
  /** Items and stock across locations; orders and movements through fulfilment stages. */
  Inventory = 'inventory',
  /** Candidates and applications through a hiring workflow per opening. */
  Recruiting = 'recruiting',
  /** Jobs dispatched to field workers and tracked to completion. */
  FieldService = 'field-service',
  /** Requests, approvals or cases through a defined multi-step process. */
  Process = 'process',
}

/** The longest case quote a project card keeps (`fields.caseQuote`) — one sentence, generously. */
export const CASE_QUOTE_MAX = 1024

/**
 * The layers, lowest first. A higher layer's value replaces the same key from a lower one.
 *
 * The ordering is the point: `technology` overrides everything, because a change of language
 * invalidates every template, prompt and package below it. Nothing today has more than one
 * technology — the ladder exists so that adding one is a data change. `experience` is last and
 * optional: it shares no key with the five build layers, so its place decides nothing today.
 */
export enum BlueprintLayer {
  Technology = 'technology',
  Stack = 'stack',
  Template = 'template',
  CreateApp = 'create-app',
  Packages = 'packages',
  Experience = 'experience',
}

export const BLUEPRINT_LAYER_ORDER: BlueprintLayer[] = [
  BlueprintLayer.Technology,
  BlueprintLayer.Stack,
  BlueprintLayer.Template,
  BlueprintLayer.CreateApp,
  BlueprintLayer.Packages,
  BlueprintLayer.Experience,
]

/**
 * How strongly a product of this kind wants a LANDING GATE — the working entry into the key
 * end-user workflow drawn on the guest home, where a guest starts before signing in.
 *
 * A PRIOR handed to the model that decides, never the decision itself: `Encourage` still lets it
 * answer "no gate" for a product with no end-user step a guest could begin, and `Discourage` still
 * lets it choose one when the specification plainly describes such a step.
 */
export enum LandingGatePreference {
  /** Most products of this kind have a first-value step a guest can begin — look for it. */
  Encourage = 'encourage',
  /** Neutral: decide from the specification alone. */
  Allow = 'allow',
  /** Products of this kind rarely have one — choose a gate only when the specification asks. */
  Discourage = 'discourage',
}

export enum BlueprintPatchKind {
  /** Deep-merge a JSON document — the manifests, the tsconfigs. */
  JsonMerge = 'json-merge',
  /** Rewrite the `<head>` of an HTML document from the project's identity. */
  HtmlHead = 'html-head',
  /** Write a document composed from the project's identity. */
  Compose = 'compose',
}
