import { makePipeline } from '@owlmeans/agent'
import type { PipelineModel, PipelineStepMapping } from '@owlmeans/agent'
import { ResearchGapCode, ResearchRole, SKILL_NAME_PATTERN, SkillStep } from '../consts.js'
import { ResearchConfigError, ResearchSkillError } from '../errors.js'
import { createSkillValidator } from '../skill.js'
import type { ResearchDeps } from '../types.js'
import { textUtils } from '../utils/text.js'
import { packageEntryUtils } from '../utils/entry.js'
import { ENTRY_ROOT_NOTE } from '../utils/entry/consts.js'
import type { PackagesState } from './packages/types.js'
import { REPAIR_INSTRUCTION, SKILL_DRAFT_FILE, SKILL_INSTRUCTION, skillSpec } from './skill/consts.js'
import type { SkillNotesPatch, SkillStepImpl as Step } from './skill/types.local.js'
import type { SkillInput, SkillNotes, SkillOutput, SkillState } from './skill/types.js'
import type { SkillExpectation } from '../skill/types.js'
import type { ResearchKit } from './types.local.js'

/**
 * `research:skill`. Without given notes the `notes` step runs `research:packages` for the package as
 * a composed child (its own run row, `<runId>/notes`, so a resume continues the child where it
 * stopped); the child's area nests under this run's, so this run's cleanup removes whatever is left.
 */
export const makeSkillPipeline = (
  kit: ResearchKit, packages: PipelineModel<PackagesState, ResearchDeps>,
): PipelineModel<SkillState, ResearchDeps> => {
  const { wiring, limits } = kit
  const stamp = (): string => new Date().toISOString()
  const validator = createSkillValidator({ maxChars: limits.skillChars })

  const notesPath = (input: SkillInput): string => input.outputs.notes ?? `${input.outputs.doc.replace(/\.md$/i, '')}.notes.md`

  const mapping: PipelineStepMapping<PackagesState, SkillState> = {
    input: parent => ({
      input: {
        packages: [{ name: parent.input.name, ...(parent.input.intent != null ? { intent: parent.input.intent } : {}) }],
        ...(parent.input.context != null ? { context: parent.input.context } : {}),
        outputs: { doc: notesPath(parent.input) },
      },
    }),
    output: child => ({
      notesAt: stamp(),
      ...(child.output?.notes[0]?.doc != null ? { notesDoc: child.output.notes[0].doc } : {}),
      ...(child.output?.verdicts[0] != null ? { verdict: child.output.verdicts[0].verdict } : {}),
      childGaps: child.output?.gaps ?? [],
    } satisfies SkillNotesPatch),
  }
  const composed = packages.asStep<SkillState>(SkillStep.Notes, mapping)

  const notes: Step = {
    step: SkillStep.Notes,
    skipWhen: async (state, ctx) => state.notesAt != null || state.input.notes != null
      || await kit.area(ctx.runId).step(SkillStep.Notes) != null,
    run: async (state, ctx) => {
      // Refused before the child spends anything on research for a skill that could never be written.
      if (!SKILL_NAME_PATTERN.test(state.input.skillName)) throw new ResearchConfigError(`skill:name:${state.input.skillName}`)
      const patch = (await composed.run(state, ctx) ?? {}) as SkillNotesPatch
      const { childGaps, ...rest } = patch
      await kit.area(ctx.runId).saveStep(SkillStep.Notes, {
        gaps: childGaps ?? [], ...(rest.notesDoc != null ? { notes: rest.notesDoc } : {}), ...(rest.verdict != null ? { verdict: rest.verdict } : {}),
      } satisfies SkillNotes)
      return rest
    },
  }

  const write: Step = {
    step: SkillStep.Write,
    skipWhen: async (state, ctx) => state.writeAt != null || await kit.area(ctx.runId).step(SkillStep.Write) != null,
    run: async (state, ctx) => {
      const { input } = state
      if (!SKILL_NAME_PATTERN.test(input.skillName)) throw new ResearchConfigError(`skill:name:${input.skillName}`)
      const area = kit.area(ctx.runId)
      const researched = await area.step<SkillNotes>(SkillStep.Notes)
      const path = input.notes ?? researched?.notes ?? state.notesDoc
      const text = path != null ? await wiring.store.outputs.readDoc(path) : null
      if (text == null || text.trim() === '') {
        await area.saveStep(SkillStep.Write, { drafted: 0 })
        return { writeAt: stamp(), drafted: 0 }
      }
      const content = [
        `# Package: ${input.name}`,
        ...(input.intent != null ? [`Wanted for: ${textUtils.line(input.intent, 200)}`] : []),
        ...(input.audience != null ? [`Read by: ${textUtils.line(input.audience, 300)}`] : []),
        ...(input.context != null && input.context.trim() !== '' ? [`## Product context\n\n${textUtils.cap(input.context.trim(), limits.contextChars)}`] : []),
        `# Usage notes\n\n${textUtils.cap(text.trim(), limits.notesChars)}`,
      ].join('\n\n')
      const answer = await wiring.models.text(ResearchRole.Writer, {
        instruction: SKILL_INSTRUCTION.replace('{skillName}', input.skillName).replace('{maxChars}', String(limits.skillChars)), content,
      }, { action: 'research-skill-write' })
      const draft = validator.normalize(answer, input.skillName)
      await wiring.store.sources.put(area.path(SKILL_DRAFT_FILE), draft)
      await area.saveStep(SkillStep.Write, { drafted: draft.length })
      return { writeAt: stamp(), drafted: draft.length }
    },
  }

  const validate: Step = {
    step: SkillStep.Validate,
    skipWhen: async (state, ctx) => state.validateAt != null || await kit.area(ctx.runId).step(SkillStep.Validate) != null,
    run: async (state, ctx) => {
      const { input } = state
      const area = kit.area(ctx.runId)
      const researched = await area.step<SkillNotes>(SkillStep.Notes)
      const gaps = [...researched?.gaps ?? []]
      const notes = input.notes ?? researched?.notes
      const verdict = researched?.verdict
      const draft = await wiring.store.sources.read(area.path(SKILL_DRAFT_FILE))
      if (draft == null) {
        if (!gaps.some(gap => gap.code === ResearchGapCode.NotGenuine)) gaps.push({ code: ResearchGapCode.NoSources, subject: input.name })
        const output: SkillOutput = { gaps: kit.sources.cap(gaps), ...(notes != null ? { notes } : {}), ...(verdict != null ? { verdict } : {}) }
        await area.saveStep(SkillStep.Validate, { output })
        return { validateAt: stamp(), output }
      }

      // What the package's own facts promise the skill shows: its root import, when the notes import the
      // root or its manifest declares one; never the package passed in as a parameter.
      const notesText = notes != null ? await wiring.store.outputs.readDoc(notes) ?? '' : ''
      const expectation: SkillExpectation = {
        package: input.name,
        rootImport: packageEntryUtils.importsRoot(input.name, notesText) || notesText.includes(`${ENTRY_ROOT_NOTE}: \`${input.name}\``),
      }
      let final = draft
      let checked = validator.validate(final, input.skillName, expectation)
      const repaired = !checked.ok
      if (!checked.ok) {
        const answer = await wiring.models.text(ResearchRole.Writer, {
          instruction: REPAIR_INSTRUCTION.replace('{skillName}', input.skillName).replace('{maxChars}', String(limits.skillChars)),
          content: `# Faults\n\n${checked.errors.map(error => `- ${error}`).join('\n')}\n\n# The SKILL.md\n\n${draft}`,
        }, { action: 'research-skill-repair' })
        final = validator.normalize(answer, input.skillName)
        checked = validator.validate(final, input.skillName, expectation)
        if (!checked.ok) {
          const error = new ResearchSkillError(`invalid:${input.skillName}:${checked.errors.length}`)
          error.errors = checked.errors
          throw error
        }
      }
      await wiring.store.outputs.writeDoc(input.outputs.doc, final)
      const output: SkillOutput = {
        doc: input.outputs.doc, chars: final.length, repaired, gaps: kit.sources.cap(gaps),
        ...(notes != null ? { notes } : {}), ...(verdict != null ? { verdict } : {}),
      }
      await area.saveStep(SkillStep.Validate, { output })
      ctx.report(`skill written${repaired ? ' after one repair' : ''}`)
      return { validateAt: stamp(), repaired, output }
    },
  }

  const cleanup: Step = {
    step: SkillStep.Cleanup,
    skipWhen: async (state, ctx) => state.cleanupAt != null
      || (state.output != null && (await wiring.store.sources.list(kit.area(ctx.runId).prefix)).length === 0),
    run: async (state, ctx) => {
      const area = kit.area(ctx.runId)
      const output = state.output ?? (await area.step<{ output: SkillOutput }>(SkillStep.Validate))?.output ?? { gaps: [] }
      await ctx.mark({ output })
      await area.clear()
      return { cleanupAt: stamp(), output }
    },
  }

  return makePipeline<SkillState, ResearchDeps>(skillSpec, { ...kit.runner, steps: [notes, write, validate, cleanup] })
}
