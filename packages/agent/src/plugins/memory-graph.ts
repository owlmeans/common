import { tool } from '@langchain/core/tools'
import type { LlmModel } from '@owlmeans/llm'
import { DEFAULT_MEMORY_NODE_CHARS, truncateAt } from '@owlmeans/agent-common'
import type { MemoryNode } from '@owlmeans/agent-common'
import { composeRollingSummary } from '../helpers/rolling.js'
import type { MemoryGraphStore } from '../stores/types.js'
import type { AgentPlugin, AgentRun, AgentToolSet } from '../types.js'

export interface MemoryGraphApi {
  /** Subsystem names and their links, without content. */
  index: (scope: string) => Promise<Array<Pick<MemoryNode, 'subsystem' | 'links' | 'updatedAt'>>>
  /** One node, plus the nodes it links to, `follow` hops deep. */
  read: (scope: string, subsystem: string, follow?: number) => Promise<MemoryNode[]>
  /** Merge `content` into a node, compacting when it outgrows its budget. */
  write: (scope: string, subsystem: string, content: string, links?: string[]) => Promise<MemoryNode>
}

export interface MemoryGraphOptions {
  store?: MemoryGraphStore
  /** Which knowledge base a run reads and writes. Defaults to the conversation's scope. */
  scope?: (run: AgentRun) => string
  /** The model used to compact an overgrown node. Without one, compaction is truncation. */
  model?: (run: AgentRun) => LlmModel | undefined
  maxNodeChars?: number
  /** Contribute the read/write tools. On by default. */
  tools?: boolean
  /** Contribute the index to the prompt. On by default. */
  injectIndex?: boolean
  action?: string
}

export const MEMORY_GRAPH_PLUGIN = 'agent-memory-graph'

/** Hops followed by default when a node is read. One: enough to see a neighbour, not a crawl. */
export const DEFAULT_FOLLOW = 1

/**
 * The subsystem memory graph, as a plain API.
 *
 * Usable with no agent at all — a pipeline helper that learns something durable writes it here the
 * same way an agent would, which is the point of it being a graph rather than a conversation log:
 * knowledge is filed under the part of the system it is about, so the next reader finds it by
 * subject instead of by scrolling back through time.
 *
 * Writes MERGE rather than replace, and compact when the node outgrows its budget. Replacing would
 * make every write a potential act of forgetting, which is not a decision a single caller has the
 * standing to take.
 */
export const memoryGraph = (
  store: MemoryGraphStore,
  options: Pick<MemoryGraphOptions, 'model' | 'maxNodeChars' | 'action'> & { run?: AgentRun } = {},
): MemoryGraphApi => {
  const { maxNodeChars = DEFAULT_MEMORY_NODE_CHARS, action = 'agent-memory-compaction' } = options
  const model = (): LlmModel | undefined =>
    options.run != null ? options.model?.(options.run) : undefined

  return {
    index: async scope => await store.index(scope),

    read: async (scope, subsystem, follow = DEFAULT_FOLLOW) => {
      const seen = new Set<string>()
      const collected: MemoryNode[] = []
      let frontier = [subsystem]

      for (let depth = 0; depth <= follow && frontier.length > 0; ++depth) {
        const next: string[] = []
        for (const name of frontier) {
          if (seen.has(name)) {
            continue
          }
          seen.add(name)
          const node = await store.read(scope, name)
          if (node == null) {
            continue
          }
          collected.push(node)
          next.push(...node.links)
        }
        frontier = next
      }

      return collected
    },

    write: async (scope, subsystem, content, links) => {
      const existing = await store.read(scope, subsystem)
      const merged = existing == null || existing.content.trim() === ''
        ? content.trim()
        : `${existing.content.trim()}\n\n${content.trim()}`

      const compacted = merged.length <= maxNodeChars
        ? merged
        : await composeRollingSummary({
          model: model(),
          previous: existing?.content ?? '',
          event: content,
          maxChars: maxNodeChars,
          action,
        })

      // Links accumulate for the same reason content merges: a writer that knows about one edge
      // should not be able to erase the ones it happens not to mention.
      const allLinks = [...new Set([...(existing?.links ?? []), ...(links ?? [])])]
        .filter(link => link !== subsystem)

      return await store.write({
        scope, subsystem, content: truncateAt(compacted, maxNodeChars), links: allLinks,
      })
    },
  }
}

/**
 * The same graph, offered to an agent as tools plus an index.
 *
 * Only the INDEX is injected into the prompt — names and links, never content. Bulk-injecting every
 * node would spend the context window on knowledge the run does not need and cannot be told apart
 * from what it does; the agent pulls what it wants by name.
 */
export const memoryGraphPlugin = (options: MemoryGraphOptions = {}): AgentPlugin => {
  const { store, injectIndex = true, tools: withTools = true } = options
  const scopeOf = (run: AgentRun): string => options.scope?.(run) ?? run.conversation.scope

  const api = (run: AgentRun): MemoryGraphApi | null => store == null
    ? null
    : memoryGraph(store, { ...options, run })

  return {
    alias: MEMORY_GRAPH_PLUGIN,
    order: 30,

    context: async run => {
      const graph = api(run)
      if (graph == null || !injectIndex) {
        return []
      }

      const index = await graph.index(scopeOf(run))
      if (index.length === 0) {
        return []
      }

      return [
        '# Memory index\n\n'
        + 'Durable notes recorded about this subject, by area. Read one with `memory_read` before '
        + 'acting on the area it covers; record what a later session would need with '
        + '`memory_write`.\n\n'
        + index
          .map(node => `- ${node.subsystem}${node.links.length > 0 ? ` → ${node.links.join(', ')}` : ''}`)
          .join('\n'),
      ]
    },

    tools: run => {
      const graph = api(run)
      if (graph == null || !withTools) {
        return {}
      }
      const scope = scopeOf(run)

      return {
        memory_index: tool(
          async () => JSON.stringify(await graph.index(scope)),
          {
            name: 'memory_index',
            description: 'List the areas that have durable notes recorded, and how they link.',
            schema: { type: 'object', properties: {}, additionalProperties: false },
          },
        ),

        memory_read: tool(
          async ({ subsystem, follow }: { subsystem: string, follow?: number }) =>
            JSON.stringify(await graph.read(scope, subsystem, follow ?? DEFAULT_FOLLOW)),
          {
            name: 'memory_read',
            description: 'Read the durable notes recorded about one area, and the areas it links to.',
            schema: {
              type: 'object',
              properties: {
                subsystem: { type: 'string', description: 'The area to read, as named in the index.' },
                follow: { type: 'number', description: 'How many link hops to include. Default 1.' },
              },
              required: ['subsystem'],
              additionalProperties: false,
            },
          },
        ),

        memory_write: tool(
          async ({ subsystem, content, links }: { subsystem: string, content: string, links?: string[] }) => {
            await graph.write(scope, subsystem, content, links)
            return `recorded under ${subsystem}`
          },
          {
            name: 'memory_write',
            description:
              'Record something a later session would need to know about one area. Merged with '
              + 'what is already there — write the new fact, not a restatement of the note.',
            schema: {
              type: 'object',
              properties: {
                subsystem: { type: 'string', description: 'The area this is about.' },
                content: { type: 'string', description: 'What to record.' },
                links: {
                  type: 'array', items: { type: 'string' },
                  description: 'Other areas this one relates to.',
                },
              },
              required: ['subsystem', 'content'],
              additionalProperties: false,
            },
          },
        ),
      } as unknown as AgentToolSet
    },
  }
}
