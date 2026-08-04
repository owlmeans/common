import { createService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { ExecutionLevel } from '@owlmeans/llm-common'
import type { ExecutionState, ModelPolicy, TaskExecutionState } from '@owlmeans/llm-common'
import { COLLABORATOR_KEYS, EXECUTION_SERVICE } from '../consts.js'
import type { TemperatureFactory } from '../types.js'
import type {
  Execution, ExecutionPlugin, ExecutionService, ExecutionServiceOptions, ExecutionShape,
  HelperExecution, TaskExecution, WithExecutionService,
} from './types.js'
import {
  composeExecState, composeTaskState, effortPatch, freeze, mergeOverride, mergePolicy, resolveRole,
} from './utils.js'

/**
 * Build the execution service implementation WITHOUT registering it as a context
 * service, so a consumer can publish extra methods alongside it (observability
 * factories, domain-specific refinement). Spread it into your own `createService`:
 *
 * ```ts
 * const api = executionServiceApi<MyShape>({ collaboratorKeys: ['files'] }, () => service)
 * const service = createService<MyExecutionService>(alias, {
 *   ...api,
 *   // delegate to `api`, never to `service`, or you recurse
 *   forTask: (parent, input) => api.forTask(parent, { ...input, effort: effortOf(input.mode) }),
 *   spectator: (exec, kind) => makeSpectator(exec, kind),
 * } as MyExecutionService)
 * ```
 */
export const executionServiceApi = <S extends ExecutionShape = ExecutionShape>(
  options: ExecutionServiceOptions,
  self: () => ExecutionService<S>,
): ExecutionService<S> => {
  const plugins: ExecutionPlugin[] = []
  const collaboratorKeys = [...COLLABORATOR_KEYS, ...(options.collaboratorKeys ?? [])]

  /** Recompose the JSON-safe state of a task execution after any refinement. */
  const recompose = <E extends Execution>(exec: E): E => {
    if (exec.level === ExecutionLevel.Task) {
      const task = exec as unknown as TaskExecution
      ;(task as { state: TaskExecutionState }).state = composeTaskState(task, collaboratorKeys)
    }
    return exec
  }

  const api: ExecutionService<S> = {

    root: input => freeze({
      ...input,
      level: ExecutionLevel.Project,
      purpose: { ...input.purpose },
      policy: { ...input.policy },
    }) as S['project'],

    forTask: (parent, input) => {
      const { effort, phase, data, ...extras } = input
      const policy = effort != null
        ? mergePolicy(parent.policy, { effort })
        : { ...parent.policy }

      // Spreading the parent carries every collaborator and domain field forward; the
      // task's own state is composed afterwards, from the seeded resumable fields.
      const taskExec = {
        ...parent, ...extras, level: ExecutionLevel.Task, purpose: { ...parent.purpose }, policy,
      } as unknown as TaskExecution
      ;(taskExec as { state: TaskExecutionState }).state = composeTaskState({
        ...taskExec,
        state: {
          level: ExecutionLevel.Task,
          purpose: taskExec.purpose,
          policy: taskExec.policy,
          phase,
          data,
        } as TaskExecutionState,
      }, collaboratorKeys)

      return freeze(taskExec) as S['task']
    },

    forHelper: (parent, input) => {
      const { role, effort, dedication, ...extras } = input
      const localPolicy = effort != null ? mergePolicy(parent.policy, { effort }) : parent.policy
      const scoped = { ...parent, policy: localPolicy } as S['exec']

      const helperExec = {
        ...parent,
        ...extras,
        level: ExecutionLevel.Helper,
        purpose: dedication != null
          ? { ...parent.purpose, dedication }
          : { ...parent.purpose },
        policy: localPolicy,
        role: resolveRole(localPolicy, role),
        model: self().model(scoped, role),
        temperatureFactory: self().temperatureFactory(scoped, role),
      } as unknown as HelperExecution
      // A helper is not resumable — drop a parent task's composed state.
      delete (helperExec as { state?: unknown }).state

      return freeze(helperExec) as S['helper']
    },

    derive: (exec, patch) => freeze(recompose({ ...exec, ...patch })),

    withPurpose: (exec, patch) =>
      freeze(recompose({ ...exec, purpose: { ...exec.purpose, ...patch } })),

    escalate: (exec, patch: Partial<ModelPolicy>) =>
      freeze(recompose({ ...exec, policy: mergePolicy(exec.policy, patch) })),

    model: (exec, role, override) => {
      const effectiveRole = resolveRole(exec.policy, role ?? (exec as HelperExecution).role)
      const policyOverride = exec.policy.modelOverrides?.[effectiveRole]
      const merged = mergeOverride(effortPatch(exec.policy.effort), policyOverride, override)
      // Strip undefined values so the factory does not see spurious keys.
      const clean = Object.fromEntries(
        Object.entries(merged).filter(([, value]) => value !== undefined)
      ) as typeof merged

      return exec.models().getModel(effectiveRole, clean)
    },

    temperatureFactory: (exec, role): TemperatureFactory =>
      temperature =>
        self().model(exec, role, {
          ...(temperature != null ? { temperature } : {}),
          ...(temperature != null && temperature > 0.2 ? { topP: 0.8 } : {}),
        }),

    use: plugin => {
      plugins.push(plugin)
    },

    checkpoint: async (exec, key) => {
      if (plugins.length === 0) {
        return
      }
      const state = self().snapshot(exec)
      await Promise.all(plugins.map(plugin => plugin.onCheckpoint?.(state, exec, key)))
    },

    snapshot: exec => {
      if (exec.level === ExecutionLevel.Task) {
        return freeze({ ...(exec as unknown as TaskExecution).state })
      }
      return freeze(composeExecState(exec, collaboratorKeys))
    },

    restore: (state: ExecutionState, collaborators = {} as S['collaborators']) => freeze({
      ...state,
      ...collaborators,
      ...(state.level === ExecutionLevel.Task ? { state } : {}),
    }) as S['exec'],

  } as ExecutionService<S>

  return api
}

export const makeExecutionService = <S extends ExecutionShape = ExecutionShape>(
  alias: string = EXECUTION_SERVICE,
  options: ExecutionServiceOptions = {},
): ExecutionService<S> => {
  const service: ExecutionService<S> = createService<ExecutionService<S>>(
    alias, executionServiceApi<S>(options, () => service) as ExecutionService<S>
  )

  return service
}

export const appendExecutionService = <
  C extends BasicConfig, T extends BasicContext<C>, S extends ExecutionShape = ExecutionShape
>(
  ctx: T,
  alias: string = EXECUTION_SERVICE,
  options: ExecutionServiceOptions = {},
): T & WithExecutionService<S> => {
  const context = ctx as T & WithExecutionService<S>

  context.registerService(makeExecutionService<S>(alias, options))

  context.executions = () => context.service<ExecutionService<S>>(alias)

  return context
}
