/**
 * The slice of a host application's file access that the LLM layer is allowed to see.
 *
 * A consumer almost always owns a much richer file helper (project metadata, source
 * classification, remote/sandbox transports). This contract is deliberately the smallest
 * useful subset, so a prompt plugin can read a package manifest or write a scratch file
 * without the common layer learning anything about the consumer's project model. A
 * consumer's own helper satisfies it structurally — declare
 * `interface FileHelper extends LlmFileProvider` and nothing else changes.
 *
 * It lives in `llm-common` (not `llm`) because it is a contract, not a runtime: the
 * package stays dependency-free and browser-safe.
 *
 * Every path is relative to the host's project root. Resolving that root is deliberately
 * NOT part of the contract — a consumer with a multi-root layout types its own accessor
 * with its own enum, and narrowing an inherited signature is exactly the kind of change
 * that stops a rich helper from satisfying this one.
 */
export interface LlmFileProvider {
  /**
   * Stable identity of WHAT this provider reads — a project root, a sandbox id.
   *
   * A prompt plugin that caches resolved reads across calls has nothing else to key on:
   * providers are late-bound and often rebuilt per request, so object identity says
   * nothing, and a cache shared between two projects serves the first one's files to the
   * second. A provider that supplies no key is treated as uncacheable rather than as one
   * more anonymous member of a shared bucket.
   */
  key?: string

  /** Read a file relative to the root. With `noThrow`, a missing file yields `''`. */
  readFile: (filePath: string, noThrow?: boolean) => Promise<string>

  /** Glob for files relative to the root. */
  getSourceList: (pattern?: string) => Promise<string[]>

  /** Write a file relative to the root, creating parent directories as needed. */
  writeFile: (filePath: string, content: string) => Promise<void>

  /** Delete a file relative to the root. With `noThrow`, a missing file is a no-op. */
  deleteFile: (filePath: string, noThrow?: boolean) => Promise<void>
}

/**
 * A provider, or a resolver for one.
 *
 * Collaborators in this layer are usually late-bound functions so a service can be
 * swapped or cloned — but a file helper is just as often a plain object a consumer
 * already holds. Accepting both spares every call site a wrapper.
 */
export type FileProviderRef = LlmFileProvider | (() => LlmFileProvider)
