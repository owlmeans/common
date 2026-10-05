import { DEFAULT_STEP_ATTEMPTS } from '../consts.js'
import { PipelineSpecError, PipelineUnknownStepError } from '../errors.js'
import type { PipelineSpec, PipelineStepSpec } from '../types.js'
import type { PipelineSpecModel, PipelineStepDepth } from './pipeline-spec/types.js'

export const makePipelineSpecModel = (spec: PipelineSpec): PipelineSpecModel => {
  const fault = (faults: string[], message: string): void => {
    faults.push(message)
  }

  const validate = (): void => {
    const faults: string[] = []

    if (spec.alias == null || spec.alias.trim() === '') {
      fault(faults, 'alias is empty')
    }
    if (!Number.isInteger(spec.version) || spec.version < 1) {
      fault(faults, `version must be a positive integer, got ${String(spec.version)}`)
    }
    if (!Array.isArray(spec.steps) || spec.steps.length === 0) {
      fault(faults, 'no steps declared')
      throw new PipelineSpecError(`${spec.alias ?? '?'}: ${faults.join('; ')}`)
    }

    const seen = new Set<string>()
    for (const step of spec.steps) {
      if (step.step == null || step.step.trim() === '') {
        fault(faults, 'a step has an empty name')
        continue
      }
      if (seen.has(step.step)) {
        fault(faults, `duplicate step "${step.step}"`)
      }
      seen.add(step.step)
    }

    for (const step of spec.steps) {
      for (const dependency of step.after ?? []) {
        if (dependency === step.step) {
          fault(faults, `step "${step.step}" declares itself in \`after\``)
        } else if (!seen.has(dependency)) {
          fault(faults, `step "${step.step}" waits on unknown step "${dependency}"`)
        }
      }
      const attempts = step.attempts ?? DEFAULT_STEP_ATTEMPTS
      if (!Number.isInteger(attempts) || attempts < 1) {
        fault(faults, `step "${step.step}" declares attempts ${String(step.attempts)}`)
      }
      if (step.nonIdempotent === true && attempts > 1) {
        fault(
          faults,
          `step "${step.step}" is nonIdempotent and declares attempts ${attempts} — an automatic `
          + 'retry is exactly what that flag says must not happen',
        )
      }
      if (step.timeout != null && (!Number.isFinite(step.timeout) || step.timeout <= 0)) {
        fault(faults, `step "${step.step}" declares timeout ${String(step.timeout)}`)
      }
    }

    // A cycle is reported here rather than left to the sort, so one message carries every fault.
    if (faults.every(entry => !entry.includes('unknown step'))) {
      const cycle = detectCycle()
      if (cycle != null) {
        fault(faults, `cycle: ${cycle.join(' → ')}`)
      }
    }

    if (faults.length > 0) {
      throw new PipelineSpecError(`${spec.alias}: ${faults.join('; ')}`)
    }
  }

  const detectCycle = (): string[] | null => {
    const after = new Map(spec.steps.map(step => [step.step, step.after ?? []]))
    const state = new Map<string, 0 | 1 | 2>()
    const path: string[] = []

    const walk = (name: string): string[] | null => {
      const mark = state.get(name)
      if (mark === 2) return null
      if (mark === 1) return [...path.slice(path.indexOf(name)), name]

      state.set(name, 1)
      path.push(name)
      for (const dependency of after.get(name) ?? []) {
        const found = walk(dependency)
        if (found != null) return found
      }
      path.pop()
      state.set(name, 2)

      return null
    }

    for (const step of spec.steps) {
      const found = walk(step.step)
      if (found != null) return found.reverse()
    }

    return null
  }

  const orderSteps = (): string[] => {
    const names = spec.steps.map(step => step.step)
    const known = new Set(names)
    const pending = new Map<string, Set<string>>()
    const dependents = new Map<string, string[]>()

    for (const step of spec.steps) {
      const dependencies = new Set<string>()
      for (const dependency of step.after ?? []) {
        if (!known.has(dependency)) {
          throw new PipelineSpecError(
            `${spec.alias}: step "${step.step}" waits on unknown step "${dependency}"`,
          )
        }
        dependencies.add(dependency)
        dependents.set(dependency, [...(dependents.get(dependency) ?? []), step.step])
      }
      pending.set(step.step, dependencies)
    }

    const ordered: string[] = []
    const emitted = new Set<string>()

    while (ordered.length < names.length) {
      // Declaration order among everything currently ready — never a set's own order.
      const ready = names.filter(name => !emitted.has(name) && (pending.get(name)?.size ?? 0) === 0)
      if (ready.length === 0) {
        const cycle = detectCycle()
        throw new PipelineSpecError(
          `${spec.alias}: cycle: ${(cycle ?? names.filter(name => !emitted.has(name))).join(' → ')}`,
        )
      }
      for (const name of ready) {
        ordered.push(name)
        emitted.add(name)
        for (const dependent of dependents.get(name) ?? []) {
          pending.get(dependent)?.delete(name)
        }
      }
    }

    return ordered
  }

  const descendants = (step: string): string[] => {
    if (!spec.steps.some(entry => entry.step === step)) {
      throw new PipelineUnknownStepError(`${spec.alias}:${step}`)
    }

    const reached = new Set<string>([step])
    let grew = true
    while (grew) {
      grew = false
      for (const entry of spec.steps) {
        if (reached.has(entry.step)) continue
        if ((entry.after ?? []).some(dependency => reached.has(dependency))) {
          reached.add(entry.step)
          grew = true
        }
      }
    }

    return orderSteps().filter(name => reached.has(name))
  }

  const ancestry = (step: string): PipelineStepDepth[] => {
    if (!spec.steps.some(entry => entry.step === step)) {
      throw new PipelineUnknownStepError(`${spec.alias}:${step}`)
    }

    const after = new Map(spec.steps.map(entry => [entry.step, entry.after ?? []]))
    const depths = new Map<string, number>()
    let frontier = [step]
    for (let depth = 1; frontier.length > 0; ++depth) {
      const next: string[] = []
      for (const name of frontier) {
        for (const dependency of after.get(name) ?? []) {
          if (dependency !== step && !depths.has(dependency)) {
            depths.set(dependency, depth)
            next.push(dependency)
          }
        }
      }
      frontier = next
    }

    return orderSteps()
      .filter(name => depths.has(name))
      .map(name => ({ step: name, depth: depths.get(name)! }))
  }

  const ancestors = (step: string): string[] =>
    ancestry(step).map(entry => entry.step)

  const stepOf = (step: string): PipelineStepSpec | null =>
    spec.steps.find(entry => entry.step === step) ?? null

  return { record: spec, validate, orderSteps, descendants, ancestry, ancestors, stepOf }
}
