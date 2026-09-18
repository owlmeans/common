
import type { SpecCategory } from '../ba/consts.js'

/**
 * Where the pipeline's markdown lives in a generated target.
 *
 * The tree follows the AGENTS.md / Agent Skills open standard rather than a private `.viable/`
 * directory, because the target is an ordinary repository that people and other agents open: a
 * brief belongs in `docs/`, and durable cross-run knowledge belongs in the agent memory graph
 * every harness already reads. A directory only this pipeline understands is invisible to all of
 * them, and a project the user takes home keeps none of it.
 *
 * The split is by AUDIENCE, not by writer. `docs/` is the product — read by a person, published
 * with the repository, meaningful without the agent. `.agents/memory/` is working state — read by
 * the next run to know what the last one allocated, decided and observed.
 */
export const HARNESS_DIR = '.agents'
export const MEMORY_DIR = `${HARNESS_DIR}/memory`
export const DOCS_DIR = 'docs'

export const STORIES_DIR = `${DOCS_DIR}/stories`
export const ENTITIES_DIR = `${DOCS_DIR}/entities`

/** Co-located specs keep their names and their place — beside the source file they describe. */
export const SPEC_SUFFIX = '.spec.md'
export const UX_SUFFIX = '.ux.md'
export const UI_SUFFIX = '.ui.md'

/**
 * Everything under `docs/` is plain markdown: the directory says what a file is, so the name
 * does not have to. `docs/stories/CHK-1.md`, not `docs/stories/CHK-1.story.md`.
 */
export const STORY_SUFFIX = '.md'
export const ENTITY_SUFFIX = '.md'

/** The project brief — `docs/project.md`, the first file anyone opens. */
export const PROJECT_META_NAME = 'project'
export const PROJECT_META_FILE = `${DOCS_DIR}/${PROJECT_META_NAME}.md`

/**
 * The name registry — `.agents/memory/registry.md`.
 *
 * Project-level, not per-story: a resource alias is a physical table name and an entity directory
 * is a repository-wide invariant, so a later story has to see what an earlier one allocated. Each
 * entry records the story that introduced it, which keeps provenance without splitting the file.
 *
 * A memory node rather than a doc: it is what the NEXT run must not contradict, and it is
 * meaningless to a reader of the product.
 */
export const REGISTRY_NAME = 'registry'
export const REGISTRY_FILE = `${MEMORY_DIR}/${REGISTRY_NAME}.md`

/**
 * The project's rolling history — `.agents/memory/history.md`.
 *
 * A file of its own rather than a section of `docs/project.md`, because `writeProject` rebuilds
 * that file's whole body out of `AgentProject`: a history section there would be destroyed by the
 * next brief update, silently and with nothing failing.
 *
 * It answers "where are we" for every model call that reads it, so it is folded under a ceiling
 * rather than appended to.
 */
export const HISTORY_NAME = 'history'
export const HISTORY_FILE = `${MEMORY_DIR}/${HISTORY_NAME}.md`

/**
 * Recorded layout deviations — `.agents/memory/layout.md`.
 *
 * The generated target IS-A `@owlmeans/create-app` project, and the pipeline derives every path
 * from that assumption. A repository the user has since reshaped by hand is still theirs, so a
 * deviation is RECORDED here instead of being corrected: the next run reads it and addresses the
 * tree that exists rather than re-deriving one that does not.
 */
export const LAYOUT_NAME = 'layout'
export const LAYOUT_FILE = `${MEMORY_DIR}/${LAYOUT_NAME}.md`

/**
 * The deployment topology — `.agents/memory/topology.md`.
 *
 * Which runtimes the project actually runs (api, web, worker), what each binds, and which queues
 * carry work between them. A worker exists only once something needs one, so this is the record
 * of that decision — the thing a later run must not silently re-decide.
 */
export const TOPOLOGY_NAME = 'topology'
export const TOPOLOGY_FILE = `${MEMORY_DIR}/${TOPOLOGY_NAME}.md`

/**
 * The ceiling on the whole rendered history block, in characters.
 *
 * Enforced by truncation after the model answers, never by asking it to obey a limit. The parts
 * below are budgeted to fit inside it with room for their separators.
 */
export const HISTORY_MAX_CHARS = 3000
export const HISTORY_LAST_EVENT_CHARS = 200
export const HISTORY_SUMMARY_CHARS = 1600
export const HISTORY_RECENT_CHARS = 140
/** How many events stay verbatim before older ones are folded into the prose. */
export const HISTORY_RECENT_MAX = 8
/** The heading the verbatim tail is written under. */
export const HISTORY_RECENT_HEADING = 'Recent'

export const METADATA_SUFFIX: Record<SpecCategory, string> = {
  ba: SPEC_SUFFIX,
  ux: UX_SUFFIX,
  ui: UI_SUFFIX,
}

/**
 * Suffixes that mark a CO-LOCATED metadata file — one sitting beside the source it describes.
 *
 * Only these three, because everything else the pipeline writes now lives under a directory of
 * its own: excluding pipeline markdown from a source listing is a question about the path, not
 * about the tail. Adding `.md` here would hide every README in the project.
 */
export const METADATA_SUFFIXES = [SPEC_SUFFIX, UX_SUFFIX, UI_SUFFIX]

/** The trees the pipeline writes into — excluded wholesale when source files are enumerated. */
export const METADATA_DIRS = [HARNESS_DIR, DOCS_DIR]
