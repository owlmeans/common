import type { SubProject } from '../slot/consts.js'
import type { ViableSkill } from '../skills/consts.js'
import type { ViablePersona } from '../skills/roles.js'
import type { TopologyDescriptor } from '../topology/types.js'

/**
 * A BLUEPRINT is everything that decides what kind of project the pipeline is building — the
 * language, the framework, the scaffolder, the seed files and the dependencies — as one named,
 * layered value carried on an execution.
 *
 * Before it, each of those was a constant somewhere: one template directory, one hardwired set of
 * five package names, one `VIABLE_SKILLS` catalogue, one `Libraries*` allow-list per area. Nothing
 * was wrong with any of them individually; what was wrong is that they could not be ANSWERED — a
 * helper could not ask "which stack am I generating for", because there was only ever one.
 *
 * Deliberately NOT called a preset: `presets/` in the agent library already means the LLM
 * model/provider configurations, and the two are asked at different moments about different
 * things.
 */
export interface Blueprint {
  id: string
  title: string
  technology: TechnologyLayer
  stack: StackLayer
  template: TemplateLayer
  createApp: CreateAppLayer
  packages: PackagesLayer
}

/**
 * The layers, lowest first. A higher layer's value replaces the same key from a lower one.
 *
 * The ordering is the point: `technology` overrides everything, because a change of language
 * invalidates every template, prompt and package below it. Nothing today has more than one
 * technology — the ladder exists so that adding one is a data change.
 */
export enum BlueprintLayer {
  Technology = 'technology',
  Stack = 'stack',
  Template = 'template',
  CreateApp = 'create-app',
  Packages = 'packages',
}

export const BLUEPRINT_LAYER_ORDER: BlueprintLayer[] = [
  BlueprintLayer.Technology,
  BlueprintLayer.Stack,
  BlueprintLayer.Template,
  BlueprintLayer.CreateApp,
  BlueprintLayer.Packages,
]

/** Language and toolchain. Overrides everything below it. */
export interface TechnologyLayer {
  id: string
  language: string
  runtime: string
  /** Extensions a source file may carry, most specific first. Used by the location ladder. */
  extensions: string[]
  /** What a package's manifest must declare, per package kind. */
  buildScripts: Record<string, string>
  packageManager: string
}

/** Framework family — what the generated code is written AGAINST. */
export interface StackLayer {
  id: string
  framework: string
  /** The arrangement a new project of this stack is created with. */
  topology: TopologyDescriptor
  /** The skills every prompt of this stack carries, before any per-helper persona. */
  skills: ViableSkill[]
}

/**
 * The seed: what is laid over the scaffolder's output, and what is then patched.
 *
 * `overlay` is a REFERENCE, never a path — the host resolves it, because the same blueprint is
 * read in an agent container, in a test and (eventually) from a published package, and a path
 * baked in here would be right in exactly one of them.
 */
export interface TemplateLayer {
  id: string
  overlay: string
  /**
   * Paths the scaffolder writes that this overlay SUPERSEDES — deleted after the overlay lands.
   *
   * Not tidiness. The two seeds are both complete, opinionated projects, and where they disagree
   * the loser's file does not become inert: it stays in the workspace, is compiled by `tsc`, and
   * imports packages the winner's manifest never declared. The scaffolder's Vite entry, its
   * `vite.config.ts` and its shell layout each name a dependency or an export the overlay's own
   * wiring does not have, and every one of them fails the type check of a project that is
   * otherwise perfectly correct.
   *
   * A directory takes its whole subtree. A path that is not there is a no-op, because the two
   * seeds move independently and an overlay must not break when the scaffolder stops shipping
   * something it used to supersede.
   */
  remove?: string[]
  /** Deterministic patches applied after the overlay, in order. */
  patches: BlueprintPatchSpec[]
  /** Overlay subtrees that belong to one role only — the per-package half of a template. */
  perRole?: Partial<Record<SubProject, string>>
}

export interface BlueprintPatchSpec {
  /** Target path, relative to the project root. */
  path: string
  kind: BlueprintPatchKind
}

export enum BlueprintPatchKind {
  /** Deep-merge a JSON document — the manifests, the tsconfigs. */
  JsonMerge = 'json-merge',
  /** Rewrite the `<head>` of an HTML document from the project's identity. */
  HtmlHead = 'html-head',
  /** Write a document composed from the project's identity. */
  Compose = 'compose',
}

/** Which scaffolder runs first, and how. */
export interface CreateAppLayer {
  id: string
  /** The npm name, for the record. The template itself is always resolved as DATA. */
  package: string
  /** Scaffold the shell without the example/demo code. Always true for a generated target. */
  bare: boolean
  /** A reference the host resolves to the scaffolder's template directory. */
  template: string
}

/**
 * The dependency choices — and therefore the prompts and skills those choices imply.
 *
 * This is the layer that makes "postgres or mongo" a blueprint question rather than a hardwired
 * catalogue. `capabilities` is what a design stage gates on; `libraries` is what a coder prompt is
 * allowed to import; `skills` is what gets loaded on top of the stack's.
 */
export interface PackagesLayer {
  id: string
  capabilities: BlueprintCapabilities
  /** Per-topic allow-lists, rendered verbatim into coder prompts. */
  libraries: Record<string, string[]>
  skills: ViableSkill[]
  /**
   * Skills added to ONE persona, rather than to every prompt of the blueprint.
   *
   * The additive twin of {@link skillsForBlueprint}, which subtracts. `skills` above is what is
   * true of the whole stack; this is what is true of one performer — the analyst who has to know
   * that a game brief is a core loop rather than a numbered flow, the architect who has to know
   * when a tool loop is warranted. Without it a case could only change what a CODER is told, and
   * a case changes the product analysis first.
   */
  personaSkills?: Partial<Record<ViablePersona, ViableSkill[]>>
  /** Extra dependencies a role's manifest carries, beyond what the overlay ships. */
  deps?: Partial<Record<SubProject, Record<string, string>>>
}

/**
 * What a target of this blueprint is ABLE to do — read by the design stage before it decides
 * whether a story needs any of it.
 *
 * A capability being on never means a story uses it. It means the question may be asked.
 */
export interface BlueprintCapabilities {
  /** Relational persistence — the default resource kind. */
  postgres: boolean
  /** A pod-local key/value store: TTL, locks, counters, fan-out. */
  kv: boolean
  /** A broker, and therefore the possibility of work off the request path. */
  queue: boolean
  /** A separate process consuming that broker. */
  worker: boolean
  /** LLM agents and pipelines generated INTO the target. */
  agents: boolean
  /** Request-body validation from generated AJV schemas. */
  validation: boolean
}

/** A partial override of a blueprint, deep-merged over the resolved value. */
export type BlueprintPatch = {
  [K in keyof Blueprint]?: Blueprint[K] extends string ? Blueprint[K] : Partial<Blueprint[K]>
}

/**
 * What an EXECUTION carries — an id and an override patch, never the resolved blueprint.
 *
 * An execution state is serialized into a pipeline run row at every step boundary, and that row
 * holds keys, never artifacts. A resolved blueprint is an artifact: it embeds a whole topology, a
 * patch list and two skill sets, and it is reconstructible from these two fields at any time.
 */
export interface BlueprintRef {
  id: string
  /**
   * WHICH KIND of product is being built on that blueprint — the case.
   *
   * A key like the id beside it, resolved into a patch on demand, so a run row still holds no
   * artifact and a case the platform has since corrected reaches a resumed run. Absent applies no
   * patch at all: every project created before cases existed keeps exactly the blueprint it had,
   * which is the only reading that cannot silently take a capability away from a live project.
   */
  case?: string
  overrides?: BlueprintPatch
}
