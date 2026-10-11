import type { BaseCheckpointSaver } from '@langchain/langgraph'

/**
 * The graph builder, seen loosely.
 *
 * `StateGraph`'s node names are a generic parameter that only a literal-typed builder chain can
 * satisfy, and a pipeline's nodes come from data. The precision belongs at THIS package's public
 * boundary — `PipelineSpec`, `PipelineStep`, `PipelineModel` are all exact — not in the three lines
 * that hand LangGraph a name it will look up in a map either way.
 */
export interface LooseGraph {
  addNode: (
    name: string,
    fn: (state: unknown) => Promise<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ) => LooseGraph
  addEdge: (start: string | string[], end: string) => LooseGraph
  compile: (options?: { checkpointer?: BaseCheckpointSaver }) => {
    invoke: (input: unknown, config?: Record<string, unknown>) => Promise<unknown>
  }
}
