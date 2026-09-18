import type { ViablePersona } from '../skills/roles.js'
import type { ViableSkill } from '../skills/consts.js'
import { blueprintCaseOf } from './case.js'
import type { Blueprint, BlueprintPatch } from './types.js'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

/**
 * Merge one layer's override over a resolved value.
 *
 * Objects merge key by key; ARRAYS REPLACE. That asymmetry is deliberate and is the difference
 * between an override and an addition: a blueprint that narrows a library allow-list to three
 * entries means those three, and a concatenating merge would hand the coder back the very imports
 * the override existed to forbid. A layer that wants to add spreads the base itself.
 */
export const mergeBlueprintValue = <T>(base: T, patch: unknown): T => {
  if (patch === undefined) return base
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T

  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    out[key] = mergeBlueprintValue(out[key], value)
  }

  return out as T
}

/**
 * Apply an override patch to a blueprint, layer by layer.
 *
 * Frozen on the way out — shallowly at each layer, which is enough to make the accidental
 * `blueprint.packages.capabilities.worker = true` a visible failure rather than a change every
 * later helper silently inherits.
 */
export const applyBlueprintPatch = (base: Blueprint, patch?: BlueprintPatch): Blueprint => {
  if (patch == null) return base

  const merged = mergeBlueprintValue(
    base as unknown as Record<string, unknown>, patch
  ) as unknown as Blueprint

  return freezeBlueprint(merged)
}

export const freezeBlueprint = (blueprint: Blueprint): Blueprint => Object.freeze({
  ...blueprint,
  technology: Object.freeze({ ...blueprint.technology }),
  stack: Object.freeze({ ...blueprint.stack }),
  template: Object.freeze({ ...blueprint.template }),
  createApp: Object.freeze({ ...blueprint.createApp }),
  packages: Object.freeze({
    ...blueprint.packages,
    capabilities: Object.freeze({ ...blueprint.packages.capabilities }),
  }),
})

/** Every skill the blueprint asks for, stack first, deduped, order preserved. */
export const blueprintSkills = (blueprint: Blueprint): Blueprint['stack']['skills'] =>
  [...new Set([...blueprint.stack.skills, ...blueprint.packages.skills])]


const union = <T>(base: readonly T[] = [], extra: readonly T[] = []): T[] =>
  [...new Set([...base, ...extra])]

/**
 * Apply a CASE to a blueprint — which kind of product is being built on this stack.
 *
 * A case is an ordinary {@link BlueprintPatch} and follows every rule an override does, with two
 * deliberate exceptions: `skills` and `personaSkills` are UNIONED with the base rather than
 * replacing it.
 *
 * The asymmetry is the difference between the two things a patch can be. An override is written
 * by somebody looking at the resolved value and narrowing it — "these three libraries and no
 * others" — and a concatenating merge would hand back the very imports it existed to forbid. A
 * case is written once, in a table, by somebody who cannot see the blueprint it will be applied
 * to; it says what this KIND of product needs IN ADDITION, and replacing there would silently
 * drop every rule the stack itself established. A case that genuinely needs to take a skill away
 * does it by narrowing a capability, which is what stops the prompt being asked at all.
 *
 * Unknown, absent and unregistered case names all resolve to the blueprint unchanged. A project
 * records the case it was drawn with, that record outlives the deploy that knew the name, and
 * "built against the stack as it stands" is a far better answer than a project that cannot open.
 */
export const applyBlueprintCase = (base: Blueprint, name?: string): Blueprint => {
  const cased = blueprintCaseOf(name)
  if (cased == null) return base

  const merged = applyBlueprintPatch(base, cased.patch)
  const patch = cased.patch

  const personaSkills = patch.packages?.personaSkills
  const stackSkills = patch.stack?.skills as ViableSkill[] | undefined
  const packageSkills = patch.packages?.skills as ViableSkill[] | undefined

  return freezeBlueprint({
    ...merged,
    stack: { ...merged.stack, skills: union(base.stack.skills, stackSkills) },
    packages: {
      ...merged.packages,
      skills: union(base.packages.skills, packageSkills),
      ...(personaSkills != null || base.packages.personaSkills != null
        ? {
          personaSkills: mergePersonaSkills(base.packages.personaSkills, personaSkills),
        }
        : {}),
    },
  })
}

const mergePersonaSkills = (
  base?: Partial<Record<ViablePersona, ViableSkill[]>>,
  extra?: Partial<Record<ViablePersona, ViableSkill[]>>,
): Partial<Record<ViablePersona, ViableSkill[]>> => {
  const out: Partial<Record<ViablePersona, ViableSkill[]>> = { ...base }
  for (const [persona, skills] of Object.entries(extra ?? {})) {
    const key = persona as ViablePersona
    out[key] = union(out[key], skills as ViableSkill[])
  }

  return out
}

/**
 * The skills ONE persona gets from the blueprint, beyond its own.
 *
 * Total, and empty for every persona a blueprint says nothing about — which is every one of them
 * on the blueprint the platform ships. `withPersona` unions this into the policy it composes.
 */
export const personaSkillsOf = (
  blueprint: Blueprint, persona: ViablePersona
): ViableSkill[] => blueprint.packages.personaSkills?.[persona] ?? []
