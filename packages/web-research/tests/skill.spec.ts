import { afterAll, describe, expect, test } from 'bun:test'
import { PipelineRunStatus } from '@owlmeans/agent-common'
import { PackageVerdictKind } from '@owlmeans/package-inspector'
import { makeResearchPipelines, ResearchSkillError, SkillStep, skillValidator } from '../src/index.js'
import { localReader, packageInspector, runStore, scriptedResearch, tempStore } from './context.js'
import { startDocsSite } from './servers.js'

const docs = startDocsSite()
afterAll(() => docs.stop())

const body = (omit?: string): string => [
  '# tinydate — tiny immutable date formatting',
  ...['When to use', 'Install', 'Imports', 'Core API', 'Recipes', 'Pitfalls', 'Version notes']
    .filter(section => section !== omit)
    .map(section => `## ${section}\n\nUse the default export.\n\nWrong:\n\n\`\`\`ts\nimport { tinydate } from 'tinydate'\n\`\`\`\n\nRight:\n\n\`\`\`ts\nimport tinydate from 'tinydate'\n\`\`\``),
].join('\n\n')

const skill = (omit?: string, description = 'Use when formatting dates with the tinydate package.'): string =>
  `---\nname: pkg-tinydate\ndescription: ${JSON.stringify(description)}\n---\n\n${body(omit)}\n`

describe('web-research — the SKILL.md validator', () => {
  test('a complete skill passes', () => {
    expect(skillValidator.validate(skill(), 'pkg-tinydate')).toMatchObject({ ok: true, errors: [], name: 'pkg-tinydate' })
  })

  test('every fault is reported at once', () => {
    const text = `---\nname: Pkg_TinyDate\ndescription: Use when: formatting dates ${'x'.repeat(1100)}\n---\n\n${body('Pitfalls')}\n\`\`\`ts\nopen fence\n`
    const result = skillValidator.validate(text, 'pkg-tinydate')
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('must match'), expect.stringContaining('must be "pkg-tinydate"'), expect.stringContaining('at most 1024'),
      expect.stringContaining('quote it'), expect.stringContaining('"## Pitfalls" section is missing'), expect.stringContaining('code fence is not closed'),
    ]))
    expect(skillValidator.validate(body(), 'pkg-tinydate').errors).toEqual([expect.stringContaining('YAML frontmatter')])
    expect(skillValidator.validate(`${skill()}${'y'.repeat(12_000)}`, 'pkg-tinydate').errors).toEqual([expect.stringContaining('size:')])
  })

  test('normalize renders the frontmatter again: the name forced, the description quoted, other fields dropped, a fence unwrapped', () => {
    const reply = '```markdown\n---\nname: wrong\ndescription: Use when: dates\nallowed-tools: Bash(*)\n---\n\n# x\n```'
    const normalized = skillValidator.normalize(reply, 'pkg-tinydate')
    expect(normalized).toBe('---\nname: pkg-tinydate\ndescription: "Use when: dates"\n---\n\n# x\n')
    expect(skillValidator.parts(normalized)?.fields).toEqual({ name: 'pkg-tinydate', description: 'Use when: dates' })
  })
})

describe('web-research — research:skill', () => {
  test('writes from given notes; a draft that fails validation gets one repair round', async () => {
    const temp = await tempStore()
    await temp.store.outputs.writeDoc('notes/tinydate.md', '# tinydate — usage notes\n\nDefault export; v2 removed the options argument.')
    const { models, scripted } = scriptedResearch([{ content: skill('Pitfalls') }, { content: skill() }])
    const result = await makeResearchPipelines({ models, store: temp.store, reader: localReader(), runs: runStore() }).skill.invoke({
      input: { name: 'tinydate', skillName: 'pkg-tinydate', notes: 'notes/tinydate.md', audience: 'coding agents', outputs: { doc: 'skills/pkg-tinydate/SKILL.md' } },
    }, { runId: 'skill-1', deps: {}, scope: 'spec' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(scripted.turns()).toBe(2)
    expect(result.state.output).toMatchObject({ doc: 'skills/pkg-tinydate/SKILL.md', repaired: true, notes: 'notes/tinydate.md' })
    expect(JSON.stringify(scripted.asked()[0])).toContain('v2 removed the options argument')
    expect(JSON.stringify(scripted.asked()[1])).toContain('section is missing')
    const written = (await temp.store.outputs.readDoc('skills/pkg-tinydate/SKILL.md'))!
    expect(skillValidator.validate(written, 'pkg-tinydate').ok).toBe(true)
    expect(await temp.store.sources.list()).toEqual([])
    await temp.dispose()
  }, 30_000)

  test('without notes it researches the package first, as a composed research:packages run', async () => {
    const temp = await tempStore()
    const runs = runStore()
    const { models, scripted } = scriptedResearch([{ content: '## Install\n`npm install tinydate` [1].\n\n## Imports\nDefault export [2].' }, { content: skill() }])
    const result = await makeResearchPipelines({
      models, store: temp.store, reader: localReader(), inspector: packageInspector(`${docs.url}/`), runs, limits: { crawlDelayMs: 0 },
    }).skill.invoke({
      input: { name: 'tinydate', skillName: 'pkg-tinydate', intent: 'format dates', outputs: { doc: 'skills/pkg-tinydate/SKILL.md' } },
    }, { runId: 'skill-2', deps: {}, scope: 'spec' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(scripted.turns()).toBe(2)
    expect(result.state.output).toMatchObject({
      doc: 'skills/pkg-tinydate/SKILL.md', notes: 'skills/pkg-tinydate/SKILL.notes.md', verdict: PackageVerdictKind.Genuine, repaired: false,
    })
    expect(await temp.store.outputs.readDoc('skills/pkg-tinydate/SKILL.notes.md')).toContain('## tinydate — usage notes')
    expect((await runs.load('skill-2/notes'))?.status).toBe(PipelineRunStatus.Done)
    expect(JSON.stringify(scripted.asked()[1])).toContain('Default export [2].')
    expect(await temp.store.sources.list()).toEqual([])
    await temp.dispose()
  }, 30_000)

  test('a draft that hedges the root import and passes the package in is repaired, the faults read from the notes\' facts', async () => {
    const temp = await tempStore()
    await temp.store.outputs.writeDoc('notes/tinydate.md', [
      '# tinydate — usage notes', '## Entry points (package manifest)',
      '- Module system: CommonJS by default (no `"type"` field)\n- main: `dist/tinydate.js`\n- The package root is importable: `tinydate`',
      '## Imports\n\nLocales: `import \'tinydate/locale/de\'`.',
    ].join('\n\n'))
    const hedged = skill().replace(/## Imports[\s\S]*?(?=## Core API)/, "## Imports\n\n```ts\nimport 'tinydate/locale/de'\n```\n\nDo not assume a root import form.\n\n")
      .replace(/## Recipes[\s\S]*?(?=## Pitfalls)/, '## Recipes\n\n```ts\nfunction stamp(tinydate: (p: string) => () => string): string {\n  return tinydate(\'{YYYY}\')()\n}\n```\n\n')
    const { models, scripted } = scriptedResearch([{ content: hedged }, { content: skill() }])
    const result = await makeResearchPipelines({ models, store: temp.store, reader: localReader(), runs: runStore() }).skill.invoke({
      input: { name: 'tinydate', skillName: 'pkg-tinydate', notes: 'notes/tinydate.md', outputs: { doc: 'skills/pkg-tinydate/SKILL.md' } },
    }, { runId: 'skill-4', deps: {}, scope: 'spec' })

    expect(result.status).toBe(PipelineRunStatus.Done)
    expect(result.state.output).toMatchObject({ repaired: true })
    // The writer is told to open Imports with the root import and never to take the package as a parameter.
    expect(JSON.stringify(scripted.asked()[0])).toContain('Imports opens with the canonical import of the package ROOT')
    const repair = JSON.stringify(scripted.asked()[1])
    expect(repair).toContain("shows no import of the package root 'tinydate'")
    expect(repair).toContain('takes `tinydate` as a function parameter')
    expect(await temp.store.outputs.readDoc('skills/pkg-tinydate/SKILL.md')).toContain("import tinydate from 'tinydate'")
    await temp.dispose()
  }, 30_000)

  test('a draft still invalid after the repair round fails the run, and nothing is written', async () => {
    const temp = await tempStore()
    await temp.store.outputs.writeDoc('notes/tinydate.md', 'notes')
    const { models } = scriptedResearch([{ content: skill('Pitfalls') }, { content: skill('Recipes') }])
    const result = await makeResearchPipelines({ models, store: temp.store, reader: localReader(), runs: runStore() }).skill.invoke({
      input: { name: 'tinydate', skillName: 'pkg-tinydate', notes: 'notes/tinydate.md', outputs: { doc: 'skills/pkg-tinydate/SKILL.md' } },
    }, { runId: 'skill-3', deps: {}, scope: 'spec' })

    expect(result.status).toBe(PipelineRunStatus.Failed)
    expect(result.failedAt).toBe(SkillStep.Validate)
    expect(result.error).toBeInstanceOf(ResearchSkillError)
    expect((result.error as ResearchSkillError).errors).toEqual([expect.stringContaining('"## Recipes" section is missing')])
    expect(await temp.store.outputs.readDoc('skills/pkg-tinydate/SKILL.md')).toBeNull()
    await temp.dispose()
  }, 30_000)
})
