/**
 * The LLM-facing half of this package: a prompt plugin that turns a mention of an
 * `@owlmeans/*` package in a prompt into that package's published skills.
 *
 * Deliberately NOT re-exported from the package index. The installer CLI has no runtime
 * dependencies and must keep it that way; this entry point resolves `@owlmeans/llm` and
 * `@owlmeans/llm-common`, which only a consumer already using the LLM layer will have.
 */

export * from './types.js'
export * from './manifest.js'
export * from './resolve.js'
export * from './plugin.js'
