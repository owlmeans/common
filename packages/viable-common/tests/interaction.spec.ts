import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { RecordInteractionPlanSchema, recordInteractionHelper } from '../src/interaction/index.js'

describe('record interaction contract', () => {
  const validate = new Ajv({ strict: false }).compile(RecordInteractionPlanSchema)
  test('accepts omitted and null optional model fields while rejecting an unknown host kind', () => {
    const plan = { entity: 'Task', capabilities: ['update'], placement: 'contextual', presentation: 'sheet' }
    expect(validate(plan)).toBe(true)
    expect(validate({ ...plan, label: null, ownerEntity: null, hostScreen: null, hostKind: null,
      hostComponent: null, selectionComponents: null, recordKey: null, parentKey: null, standaloneReason: null }), JSON.stringify(validate.errors)).toBe(true)
    expect(validate({ ...plan, hostKind: 'editor-menu' })).toBe(false)
    expect(validate({ ...plan, hostComponent: 'task/details.tsx', selectionComponents: ['task/list.tsx'] })).toBe(true)
    expect(validate({ ...plan, selectionComponents: [42] })).toBe(false)
    const responsibility = { component: 'task/details.tsx', entity: 'Task', roles: ['detail', 'editor'], capabilities: ['update'], scope: 'Edit the selected task.' }
    expect(validate({ ...plan, componentResponsibilities: [responsibility] }), JSON.stringify(validate.errors)).toBe(true)
    expect(validate({ ...plan, componentResponsibilities: null })).toBe(true)
    expect(validate({ ...plan, componentResponsibilities: [{ ...responsibility, roles: ['sidebar-action'] }] })).toBe(false)
    expect(validate({ ...plan, componentResponsibilities: [{ ...responsibility, scope: '' }] })).toBe(false)
  })
  test('a record detail may host actions without becoming a menu destination', () => {
    const plan = { entity: 'Task', capabilities: ['update'] as const, placement: 'contextual' as const,
      presentation: 'sheet' as const, hostScreen: 'Tasks/Detail', hostKind: 'record' as const }
    expect(recordInteractionHelper.menuEligible({ ...plan, capabilities: ['update'] }, 'tasks/detail')).toBe(false)
  })
})
