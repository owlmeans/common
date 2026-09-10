import type { Config, FlowSpec } from '@owlmeans/queue'
import type { FlowChildJob, FlowJob, JobsOptions } from 'bullmq'
import { bullOptionsOf } from './record.js'
import { declaredJob } from './declaration.js'

/**
 * One node of a graph as bullmq takes it. A node may name its own queue — a pipeline whose steps
 * live in different queues is the point of a flow — and whichever queue it lands in still has to
 * declare the job name.
 */
export const flowJobOf = <C extends Config>(cfg: C, spec: FlowSpec, queue: string): FlowJob => {
  const target = spec.queue ?? queue
  const declared = declaredJob(cfg, target, spec.name, spec.opts)

  return {
    name: declared.name,
    queueName: target,
    data: spec.data,
    opts: bullOptionsOf(declared.opts),
    children: spec.children?.map(child => flowChildOf(cfg, child, target))
  }
}

/**
 * Children report, parents decide.
 *
 * `ignoreDependencyOnFailure` moves a child that exhausted its attempts out of the parent's
 * dependencies and into its ignored set, so the parent still runs and reads the failure through
 * `failedChildren()`. The alternative — `failParentOnFailure` — kills the parent before it can
 * decide anything, which is exactly the decision a compensating step exists to make.
 */
const flowChildOf = <C extends Config>(cfg: C, spec: FlowSpec, queue: string): FlowChildJob => {
  const node = flowJobOf(cfg, spec, queue)
  const opts: JobsOptions = { ...node.opts, ignoreDependencyOnFailure: true }

  return { ...node, opts }
}
