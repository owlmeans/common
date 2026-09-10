import { createService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import {
  capAnswer, defaultAnswerFor, ExecutionEffort, ExecutionLevel, InquiryPolicy, UTILITY_ROLE,
} from '@owlmeans/llm-common'
import type { ExecutionState, ModelPolicy, TaskExecutionState } from '@owlmeans/llm-common'
import { COLLABORATOR_KEYS, EXECUTION_SERVICE } from '../consts.js'
import { InquiryDeclined } from '../inquiry/errors.js'
import { inquiryTransportFor } from '../inquiry/transport.js'
import type { TemperatureFactory } from '../types.js'
import type {
  Execution, ExecutionPlugin, ExecutionService, ExecutionServiceOptions, ExecutionShape,
  HelperExecution, TaskExecution, WithExecutionService,
} from './types.js'
import {
  composeExecState, composeTaskState, effortPatch, freeze, mergeOverride, mergePolicy,
  mergePrompt, resolveRole,
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
      ...(input.prompt != null ? { prompt: { ...input.prompt } } : {}),
      // Copied like every other piece of state, and NOT listed in `COLLABORATOR_KEYS`: a resumed
      // run has to ask through the channel and policy it was started with.
      ...(input.inquiry != null ? { inquiry: { ...input.inquiry } } : {}),
    }) as S['project'],

    forTask: (parent, input) => {
      const { effort, phase, data, prompt, ...extras } = input
      const policy = effort != null
        ? mergePolicy(parent.policy, { effort })
        : { ...parent.policy }
      const merged = mergePrompt(parent.prompt, prompt)

      // Spreading the parent carries every collaborator and domain field forward; the
      // task's own state is composed afterwards, from the seeded resumable fields.
      const taskExec = {
        ...parent, ...extras, level: ExecutionLevel.Task, purpose: { ...parent.purpose }, policy,
        ...(merged != null ? { prompt: merged } : {}),
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
      const { role, effort, dedication, prompt, output, ...extras } = input
      const localPolicy = effort != null ? mergePolicy(parent.policy, { effort }) : parent.policy
      const scoped = { ...parent, policy: localPolicy } as S['exec']
      const merged = mergePrompt(parent.prompt, prompt)
      // Destructured out of `extras` deliberately: `output` selects a model budget, it is
      // not a field the helper carries around.
      const sizing = output != null ? { maxTokens: output } : undefined

      const helperExec = {
        ...parent,
        ...extras,
        level: ExecutionLevel.Helper,
        purpose: dedication != null
          ? { ...parent.purpose, dedication }
          : { ...parent.purpose },
        policy: localPolicy,
        ...(merged != null ? { prompt: merged } : {}),
        role: resolveRole(localPolicy, role),
        model: self().model(scoped, role, sizing),
        temperatureFactory: self().temperatureFactory(scoped, role, sizing),
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

    utility: (exec, override) => {
      // Delegated to `model` rather than re-resolved here: the utility tier has to obey
      // the same roleOverride/modelOverride precedence as any other role, and a second
      // copy of that ladder drifts from the first the moment one of them changes.
      const scoped = {
        ...exec, policy: mergePolicy(exec.policy, { effort: ExecutionEffort.Economy }),
      } as S['exec']

      return self().model(scoped, exec.policy.utilityRole ?? UTILITY_ROLE, override)
    },

    temperatureFactory: (exec, role, baseOverride): TemperatureFactory =>
      temperature =>
        self().model(exec, role, {
          // A budget the helper was built with survives a temperature refinement — the
          // work is the same size whether or not it is being retried creatively.
          ...(typeof baseOverride === 'object' ? baseOverride : {}),
          ...(temperature != null ? { temperature } : {}),
          ...(temperature != null && temperature > 0.2 ? { topP: 0.8 } : {}),
        }),

    use: plugin => {
      // Seated by alias when it has one: mixins compose, and a layer wired twice would otherwise
      // answer twice — silently, since the first usable answer wins.
      const at = plugin.alias != null
        ? plugins.findIndex(entry => entry.alias === plugin.alias)
        : -1
      if (at < 0) {
        plugins.push(plugin)
      } else {
        plugins[at] = plugin
      }
    },

    advise: async (exec, request) => {
      for (const plugin of plugins) {
        if (plugin.advise == null) continue
        try {
          const advice = await plugin.advise(exec, request)
          if (advice != null && advice.trim() !== '') {
            return advice
          }
        } catch (e) {
          // Advice is an optimization. A broken advisor must never take the work with it.
          console.warn(`Execution advisor failed for "${request.kind}":`, e)
        }
      }

      return null
    },

    ask: async (exec, inquiry, signal) => {
      const policy = exec.inquiry?.policy ?? InquiryPolicy.Default
      // No channel was ever configured, so there is nobody to wait for: assume and carry on.
      if (policy === InquiryPolicy.Default) return defaultAnswerFor(inquiry)
      if (policy === InquiryPolicy.Refuse) throw new InquiryDeclined(inquiry.id)

      return capAnswer(await inquiryTransportFor(exec.inquiry?.transport).ask(inquiry, signal))
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
