import {
  FieldsInvalid, PlanningResourceKind, PLANNING_ASSIGNEE, PLANNING_REPORTER, ProjectMode,
  RelationshipRefused, TransitionAction, validateHelper, WorkcardKind, type RelationshipDraft, type Workcard,
} from '@owlmeans/planning'
import { makePlanningHierarchy } from './hierarchy.js'
import type { PlanningRuntime } from './types.js'
import type { PlanningInvariants } from './invariants/types.js'

/** Checks projected state again at persistence time, including queued writes whose parents moved. */
export const makePlanningInvariants = (runtime: PlanningRuntime): PlanningInvariants => {
  const registryFor = async (card: Workcard) => await runtime.schemasFor(card.entityId, await makePlanningHierarchy(runtime).project(card))
  const referencesOf = async (card: Workcard): Promise<RelationshipDraft[]> => {
    const schemas = await registryFor(card)
    const refs: RelationshipDraft[] = []
    if (card.reporter != null) refs.push({ type: PLANNING_REPORTER, to: card.reporter, toKind: PlanningResourceKind.Assignee })
    if (card.assignee != null) refs.push({ type: PLANNING_ASSIGNEE, to: card.assignee, toKind: PlanningResourceKind.Assignee })
    for (const rule of schemas.type(card.type).relationships ?? []) {
      if (rule.field == null) continue
      const value = card.fields[rule.field]
      if (value == null) continue
      if (rule.multiple !== true && typeof value !== 'string') throw new FieldsInvalid(`relationship:field:${rule.field}:single`)
      if (rule.multiple === true && (!Array.isArray(value) || value.some(id => typeof id !== 'string'))) throw new FieldsInvalid(`relationship:field:${rule.field}:multiple`)
      for (const id of Array.isArray(value) ? value : [value]) refs.push({ type: rule.name, to: id as string, toKind: rule.toKind ?? PlanningResourceKind.Workcard })
    }
    return refs
  }
  const assertReference = async (card: Workcard, ref: RelationshipDraft, existing: boolean): Promise<void> => {
    const reader = runtime.reader()
    const kind = ref.toKind ?? PlanningResourceKind.Workcard
    const target = kind === PlanningResourceKind.Assignee ? await reader.assignees?.get(ref.to, card.entityId)
      : kind === PlanningResourceKind.Team ? await reader.teams?.get(ref.to, card.entityId)
        : kind === PlanningResourceKind.Workcard ? await reader.cards.get(ref.to, card.entityId) : null
    if (target == null || target.entityId !== card.entityId) throw new RelationshipRefused(`reference:${kind}:${ref.to}`)
    const rule = (await registryFor(card)).type(card.type).relationships?.find(rule => rule.name === ref.type)
    if (rule?.from != null && !rule.from.includes(card.type)) throw new RelationshipRefused(`from-type:${ref.type}:${card.type}`)
    if (rule?.to != null && !rule.to.includes('type' in target ? String(target.type) : '')) throw new RelationshipRefused(`to-type:${ref.type}`)
    if (kind === PlanningResourceKind.Assignee && !existing && 'retired' in target && target.retired) throw new RelationshipRefused(`assignee:retired:${ref.to}`)
  }
  const invariants: PlanningInvariants = {
    validate: async (before, after, transition) => {
      const hierarchy = makePlanningHierarchy(runtime)
      if (after == null) {
        if (before != null) {
          await hierarchy.validate(before, true)
          const doomed = new Set([before.id!, ...(before.kind === WorkcardKind.Project ? (await hierarchy.descendants(before.id!, before.entityId)).map(card => card.id!) : [])])
          const incoming = await runtime.reader().links?.list({ entityId: before.entityId, to: [...doomed], toKind: PlanningResourceKind.Workcard }, { size: 0 })
          for (const edge of incoming?.items ?? []) {
            if (doomed.has(edge.from) || (edge.fromKind ?? PlanningResourceKind.Workcard) !== PlanningResourceKind.Workcard) continue
            const owner = await runtime.reader().cards.get(edge.from, before.entityId)
            if (owner != null && (await registryFor(owner)).type(owner.type).relationships?.some(rule => rule.name === edge.type && rule.field != null)) {
              throw new RelationshipRefused(`reference-in-use:${edge.to}:${edge.from}`)
            }
          }
        }
        return
      }
      await hierarchy.validate(after)
      const schemas = await registryFor(after)
      validateHelper.validateCard(after, schemas)
      if (after.kind !== WorkcardKind.Project && after.mode != null) throw new FieldsInvalid('mode:project-only')
      if (after.kind === WorkcardKind.Project && after.mode == null) after.mode = ProjectMode.Opened
      const previous = before == null ? [] : await referencesOf(before)
      for (const ref of await referencesOf(after)) await assertReference(after, ref, previous.some(entry => entry.type === ref.type && entry.to === ref.to && entry.toKind === ref.toKind))
      const counted = new Map<string, Set<string>>()
      for (const link of transition.links ?? (transition.link != null ? [transition.link] : [])) {
        const rule = schemas.type(after.type).relationships?.find(rule => rule.name === link.type)
        if (rule == null) throw new RelationshipRefused(`unknown:${link.type}`)
        if ((link.toKind ?? PlanningResourceKind.Workcard) !== (rule.toKind ?? PlanningResourceKind.Workcard) || (link.fromKind ?? PlanningResourceKind.Workcard) !== PlanningResourceKind.Workcard) throw new RelationshipRefused(`kind:${link.type}`)
        if (link.from != null && link.from !== after.id) throw new RelationshipRefused(`from:${link.from}`)
        if (rule?.field != null) throw new RelationshipRefused(`field-authoritative:${rule.field}`)
        if (transition.action !== TransitionAction.Unlink) {
          await assertReference(after, link, false)
          if (rule.single) {
            const destinations = counted.get(rule.name) ?? new Set<string>()
            destinations.add(link.to)
            for (const edge of (await runtime.reader().links?.list({ entityId: after.entityId, from: after.id, type: rule.name }, { size: 0 }))?.items ?? []) destinations.add(edge.to)
            counted.set(rule.name, destinations)
            if (destinations.size > 1) throw new RelationshipRefused(`single:${rule.name}`)
          }
        }
      }
      if (before != null && (before.parent !== after.parent || JSON.stringify(before.parents) !== JSON.stringify(after.parents))) {
        const reader = runtime.reader()
        const alternate: PlanningRuntime = { ...runtime, reader: () => ({ ...reader, cards: { ...reader.cards, get: async (id, entityId) => id === after.id && entityId === after.entityId ? after : await reader.cards.get(id, entityId) } }) }
        const hypothetical = makePlanningHierarchy(alternate)
        for (const child of await hierarchy.descendants(after.id!, after.entityId)) {
          await hypothetical.validate(child)
          await makePlanningInvariants(alternate).validate(child, child, { ...transition, links: undefined, link: undefined, action: TransitionAction.Update })
        }
      }
    },
    references: async (after, transition) => {
      const links = runtime.service().store(after.type).links
      if (links == null) return
      const schemas = await registryFor(after)
      const types = [PLANNING_REPORTER, PLANNING_ASSIGNEE, ...(schemas.type(after.type).relationships ?? []).filter(rule => rule.field != null).map(rule => rule.name)]
      const wanted = await referencesOf(after)
      const stored = await links.list({ entityId: after.entityId, from: after.id, type: types }, { size: 0 })
      for (const link of stored.items) if (!wanted.some(ref => ref.type === link.type && ref.to === link.to && (ref.toKind ?? PlanningResourceKind.Workcard) === (link.toKind ?? PlanningResourceKind.Workcard))) await links.drop({ entityId: after.entityId, id: link.id })
      for (const ref of wanted) await links.put({ ...ref, from: after.id!, fromKind: PlanningResourceKind.Workcard, entityId: after.entityId, createdAt: transition.at, transition: transition.id, project: transition.project })
    },
  }
  return invariants
}
