import { beforeEach, describe, expect, test } from 'bun:test'
import { ExecutionEffort, ExecutionLevel } from '@owlmeans/llm-common'
import type { ExecutionState, ModelConfigPatch, TaskExecutionState } from '@owlmeans/llm-common'
import { DEFAULT_EFFORT, EFFORT_TABLE, makeExecutionService, makeLlmService } from '@owlmeans/llm'
import type { ExecutionService, ProjectExecution, TaskExecution } from '@owlmeans/llm'
import { offlineConfigs, Role } from './context.js'

let service: ExecutionService
let root: ProjectExecution
/** Every `getModel` call the executions made, in order — asserts policy resolution. */
let resolved: Array<{ alias: string, override?: Partial<ModelConfigPatch> }>

const makeService = () => {
  const llm = makeLlmService({ models: offlineConfigs }, `spec-exec-llm-${resolved.length}`)
  const recording = {
    ...llm,
    getModel: (alias: string, override?: Partial<ModelConfigPatch>) => {
      resolved.push({ alias, override })
      return llm.getModel(alias, override)
    },
  }
  return () => recording as unknown as ReturnType<typeof makeLlmService>
}

beforeEach(() => {
  resolved = []
  service = makeExecutionService(`spec-exec-${Math.trunc(performance.now() * 1000)}`)
  root = service.root({
    models: makeService(),
    policy: { effort: DEFAULT_EFFORT },
    purpose: { type: 'spec' },
  })
})

describe('@owlmeans/llm — execution immutability', () => {
  test('every construction and refinement returns a frozen object', () => {
    expect(Object.isFrozen(root)).toBe(true)
    expect(Object.isFrozen(service.forTask(root, {}))).toBe(true)
    expect(Object.isFrozen(service.forHelper(root, { role: Role.Analyst }))).toBe(true)
    expect(Object.isFrozen(service.derive(root, {}))).toBe(true)
  })

  test('refining never mutates the parent', () => {
    const escalated = service.escalate(root, { effort: ExecutionEffort.Max })
    expect(escalated).not.toBe(root)
    expect(root.policy.effort).toBe(DEFAULT_EFFORT)
    expect(escalated.policy.effort).toBe(ExecutionEffort.Max)
  })

  test('purpose refinement is additive and local', () => {
    const dedicated = service.withPurpose(root, { dedication: 'inner' })
    expect(dedicated.purpose).toEqual({ type: 'spec', dedication: 'inner' })
    expect(root.purpose.dedication).toBeUndefined()
  })
})

describe('@owlmeans/llm — execution levels', () => {
  test('a task inherits the parent context and composes its own state', () => {
    const task = service.forTask(root, { phase: 'draft', data: { step: 1 } })
    expect(task.level).toBe(ExecutionLevel.Task)
    expect(task.state.phase).toBe('draft')
    expect(task.state.data).toEqual({ step: 1 })
    expect(task.models).toBe(root.models)
  })

  test('a task effort applies to the task and everything derived from it', () => {
    const task = service.forTask(root, { effort: ExecutionEffort.High })
    expect(task.policy.effort).toBe(ExecutionEffort.High)
    expect(service.forHelper(task, { role: Role.Analyst }).policy.effort).toBe(ExecutionEffort.High)
    expect(root.policy.effort).toBe(DEFAULT_EFFORT)
  })

  test('a helper resolves a model and a temperature factory bound to its role', () => {
    const helper = service.forHelper(root, { role: Role.Analyst, dedication: 'summarise' })
    expect(helper.level).toBe(ExecutionLevel.Helper)
    expect(helper.role).toBe(Role.Analyst)
    expect(helper.model).toBeDefined()
    expect(helper.purpose.dedication).toBe('summarise')
    expect(resolved[0]?.alias).toBe(Role.Analyst)

    helper.temperatureFactory(0.9)
    expect(resolved.at(-1)).toEqual({ alias: Role.Analyst, override: { temperature: 0.9, topP: 0.8 } })
  })

  test('a helper effort bump does not escalate the branch it came from', () => {
    const helper = service.forHelper(root, { role: Role.Analyst, effort: ExecutionEffort.Max })
    expect(helper.policy.effort).toBe(ExecutionEffort.Max)
    expect(root.policy.effort).toBe(DEFAULT_EFFORT)
  })

  test('a helper derived from a task carries no resumable state of its own', () => {
    const task = service.forTask(root, { phase: 'draft' })
    const helper = service.forHelper(task, { role: Role.Analyst })
    expect((helper as unknown as { state?: unknown }).state).toBeUndefined()
  })
})

describe('@owlmeans/llm — model policy resolution', () => {
  test('the effort tier is merged into the resolution override', () => {
    const high = service.escalate(root, { effort: ExecutionEffort.High })
    service.model(high, Role.Analyst)
    expect(resolved.at(-1)?.override).toEqual(EFFORT_TABLE[ExecutionEffort.High])
  })

  test('a role override remaps which role is actually resolved', () => {
    const remapped = service.escalate(root, { roleOverrides: { [Role.Analyst]: Role.Picker } })
    service.model(remapped, Role.Analyst)
    expect(resolved.at(-1)?.alias).toBe(Role.Picker)
  })

  test('an explicit model override wins over the effort tier', () => {
    const pinned = service.escalate(root, {
      effort: ExecutionEffort.High,
      modelOverrides: { [Role.Analyst]: { maxTokens: 999 } },
    })
    service.model(pinned, Role.Analyst)
    expect(resolved.at(-1)?.override).toEqual({ ...EFFORT_TABLE[ExecutionEffort.High], maxTokens: 999 })
  })

  test('a call-site override wins over the policy', () => {
    const pinned = service.escalate(root, { modelOverrides: { [Role.Analyst]: { maxTokens: 999 } } })
    service.model(pinned, Role.Analyst, { maxTokens: 111 })
    expect(resolved.at(-1)?.override).toEqual({ maxTokens: 111 })
  })

  test('a string override is read as a preset alias', () => {
    const pinned = service.escalate(root, { modelOverrides: { [Role.Analyst]: Role.Picker } })
    service.model(pinned, Role.Analyst)
    expect(resolved.at(-1)?.override).toEqual({ preset: Role.Picker })
  })

  test('undefined keys never reach the factory', () => {
    service.model(root, Role.Analyst, { maxTokens: undefined })
    expect(resolved.at(-1)?.override).toEqual({})
  })
})

describe('@owlmeans/llm — snapshot and restore', () => {
  test('a snapshot carries the state and none of the collaborators', () => {
    const state = service.snapshot(root) as ExecutionState & Record<string, unknown>
    expect(state.level).toBe(ExecutionLevel.Project)
    expect(state.purpose).toEqual({ type: 'spec' })
    expect(state.models).toBeUndefined()
    expect(JSON.stringify(state)).toBeString()
  })

  // Regression: `composeExecState` used to copy `state` itself, so every refinement of a
  // task nested another copy of the previous state (state.state.state…), growing the
  // snapshot without bound.
  test('repeatedly refining a task never nests its state', () => {
    let task: TaskExecution = service.forTask(root, { phase: 'draft' })
    for (let i = 0; i < 5; i++) {
      task = service.escalate(task, { effort: ExecutionEffort.High })
      task = service.withPurpose(task, { dedication: `round-${i}` })
      task = service.derive(task, {})
    }
    expect((task.state as unknown as { state?: unknown }).state).toBeUndefined()
    expect((service.snapshot(task) as unknown as { state?: unknown }).state).toBeUndefined()
    expect(task.state.phase).toBe('draft')
    expect(task.purpose.dedication).toBe('round-4')
  })

  test('a task snapshot keeps the resumable fields across refinement', () => {
    const task = service.forTask(root, { phase: 'draft', data: { step: 1 } })
    const advanced = service.escalate(task, { effort: ExecutionEffort.Max })
    const state = service.snapshot(advanced) as TaskExecutionState
    expect(state.phase).toBe('draft')
    expect(state.data).toEqual({ step: 1 })
    expect(state.policy.effort).toBe(ExecutionEffort.Max)
  })

  test('restore re-attaches the collaborators to a persisted state', () => {
    const task = service.forTask(root, { phase: 'draft' })
    const state = JSON.parse(JSON.stringify(service.snapshot(task))) as ExecutionState
    const restored = service.restore(state, { models: root.models })
    expect(restored.level).toBe(ExecutionLevel.Task)
    expect(restored.models).toBe(root.models)
    expect((restored as TaskExecution).state.phase).toBe('draft')
    expect(Object.isFrozen(restored)).toBe(true)
  })
})

describe('@owlmeans/llm — prompt policy accumulation', () => {
  const withPrompt = () => service.root({
    models: makeService(),
    policy: { effort: DEFAULT_EFFORT },
    purpose: { type: 'spec' },
    prompt: { role: 'project role', skills: ['base'] },
  })

  // Skills accumulate as work narrows — that is how a helper ends up knowing everything
  // the project, the task and its own role declared, without any of them repeating it.
  test('skills accumulate down the chain while the deepest role wins', () => {
    const task = service.forTask(withPrompt(), { prompt: { skills: ['task'] } })
    expect(task.prompt?.skills).toEqual(['base', 'task'])
    expect(task.prompt?.role).toBe('project role')

    const helper = service.forHelper(task, {
      role: Role.Analyst, prompt: { role: 'helper role', skills: ['helper'] },
    })
    expect(helper.prompt?.skills).toEqual(['base', 'task', 'helper'])
    expect(helper.prompt?.role).toBe('helper role')
  })

  // A skill declared twice must not render twice, or the composed prefix differs from the
  // one a single declaration would have produced.
  test('a repeated skill is unioned, not duplicated', () => {
    const task = service.forTask(withPrompt(), { prompt: { skills: ['base', 'task'] } })
    expect(task.prompt?.skills).toEqual(['base', 'task'])
  })

  test('levels that declare nothing inherit the policy untouched', () => {
    const helper = service.forHelper(service.forTask(withPrompt(), {}), { role: Role.Analyst })
    expect(helper.prompt).toEqual({ role: 'project role', skills: ['base'] })
  })

  // It is part of ExecutionState, so a resumed run rebuilds the same system prompt.
  test('the policy survives a snapshot/restore round trip', () => {
    const helper = service.forHelper(withPrompt(), { role: Role.Analyst })
    const restored = service.restore(service.snapshot(helper), { models: makeService() })
    expect(restored.prompt).toEqual({ role: 'project role', skills: ['base'] })
  })
})

describe('@owlmeans/llm — resilience plugin seam', () => {
  test('checkpoint is a no-op until a plugin is registered', async () => {
    await expect(service.checkpoint(root, 'key')).resolves.toBeUndefined()
  })

  test('a registered plugin receives the JSON-safe state and the execution', async () => {
    const seen: Array<{ state: ExecutionState, key?: string }> = []
    service.use({ onCheckpoint: async (state, _exec, key) => { seen.push({ state, key }) } })

    const task = service.forTask(root, { phase: 'draft' })
    await service.checkpoint(task, 'project-1')

    expect(seen).toHaveLength(1)
    expect(seen[0]!.key).toBe('project-1')
    expect((seen[0]!.state as TaskExecutionState).phase).toBe('draft')
    expect((seen[0]!.state as unknown as { models?: unknown }).models).toBeUndefined()
  })
})
