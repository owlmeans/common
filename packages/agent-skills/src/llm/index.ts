/**
 * The LLM-facing half of this package: prompt plugins that turn what a request talks
 * about into knowledge in its system prompt — a mention of an `@owlmeans/*` package into
 * that package's published skills, and the project's own installed skills (the Agent
 * Skills standard) into an always-cheap index plus bodies on demand.
 *
 * Deliberately NOT re-exported from the package index. The installer CLI has no runtime
 * dependencies and must keep it that way; this entry point resolves `@owlmeans/llm` and
 * `@owlmeans/llm-common`, which only a consumer already using the LLM layer will have.
 */

export * from './types.js'
export * from './manifest.js'
export * from './resolve.js'
export * from './plugin.js'
export * from './skill-file.js'
export * from './cache.js'
export * from './relevance.js'
export * from './project.js'
export * from './agent-plugin.js'
