import { describe, expect, test } from 'bun:test'
import { PromptBlock } from '@owlmeans/llm-common'
import type { LlmFileProvider } from '@owlmeans/llm-common'
import { anthropicPlugin, makePromptService } from '@owlmeans/llm'
import type { ModelConfig, PromptInput, PromptService } from '@owlmeans/llm'
import {
  invalidateProjectSkills, owlmeansPackagesPlugin, parseSkillFile, projectSkillsPlugin,
} from '@owlmeans/agent-skills/llm'

const model = anthropicPlugin.build({
  alias: 'spec',
  secret: 'sk-test',
  callbacks: [],
  config: { alias: 'spec', model: 'claude-haiku-4-5-20251001' } as ModelConfig,
})

const skillFile = (name: string, description: string, body: string): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`

const FILES: Record<string, string> = {
  '.agents/skills/auth/SKILL.md': skillFile('auth', 'How this project authenticates.', 'AUTH BODY'),
  '.agents/skills/deploy/SKILL.md': skillFile('deploy', 'How this project ships.', 'DEPLOY BODY'),
  '.agents/skills/broken/SKILL.md': '# no frontmatter at all\n\nBROKEN BODY',
  '.agents/skills/mismatched/SKILL.md': skillFile('other', 'Name does not match its dir.', 'X'),
}

interface FakeProvider extends LlmFileProvider { reads: string[] }

let seq = 0

/** A project tree served entirely through the file provider, recording every read. */
const fakeProject = (files: Record<string, string> = FILES): FakeProvider => {
  const reads: string[] = []

  return {
    // A distinct key per instance: the cache is module-level, so two specs sharing a key
    // would share each other's listings.
    key: `spec-project-${seq++}`,
    reads,
    getSourceList: async pattern => {
      reads.push(`glob:${pattern ?? ''}`)
      return Object.keys(files).filter(path => path.startsWith('.agents/skills/'))
    },
    readFile: async path => {
      reads.push(path)
      return files[path] ?? ''
    },
    writeFile: async () => { },
    deleteFile: async () => { },
  }
}

const withPlugins = (
  plugins: Parameters<typeof makePromptService>[0]['plugins'],
): PromptService => makePromptService({ plugins }, `spec-project-${seq++}`)

const compose = (
  svc: PromptService, files: LlmFileProvider, text: string, input: PromptInput = {},
) => svc.compose(
  input, [{ role: 'user', content: text }], { model, provider: anthropicPlugin, files: () => files }
)

const blockOf = (
  result: { blocks: Array<{ block: PromptBlock, text: string }> }, block: PromptBlock,
): string | undefined => result.blocks.find(entry => entry.block === block)?.text

describe('@owlmeans/agent-skills — SKILL.md parsing', () => {
  test('a spec-compliant file yields its name, description and body', () => {
    const skill = parseSkillFile(
      '.agents/skills/deploy/SKILL.md',
      '---\nname: deploy\ndescription: How this project ships.\nlicense: MIT\n---\n\n# Deploy\n',
    )
    expect(skill?.name).toBe('deploy')
    expect(skill?.description).toBe('How this project ships.')
    expect(skill?.body).toBe('# Deploy')
    expect(skill?.license).toBe('MIT')
  })

  test('a name that differs from its directory is not a skill', () => {
    expect(parseSkillFile(
      '.agents/skills/deploy/SKILL.md', '---\nname: shipping\ndescription: x\n---\nbody',
    )).toBeNull()
  })

  test('an unparseable header is skipped rather than thrown', () => {
    expect(parseSkillFile('.agents/skills/deploy/SKILL.md', '# just markdown')).toBeNull()
    expect(parseSkillFile(
      '.agents/skills/deploy/SKILL.md', '---\nname: deploy\n---\nno description',
    )).toBeNull()
    expect(parseSkillFile(
      '.agents/skills/DEPLOY/SKILL.md', '---\nname: DEPLOY\ndescription: x\n---\nbody',
    )).toBeNull()
  })

  test('a description folded over several lines becomes one line', () => {
    const skill = parseSkillFile(
      '.agents/skills/deploy/SKILL.md',
      '---\nname: deploy\ndescription: >-\n  How this project\n  ships.\n---\nbody',
    )
    expect(skill?.description).toBe('How this project ships.')
  })
})

describe('@owlmeans/agent-skills — project skills plugin', () => {
  test('the index lands in the skills block, one line per installed skill', async () => {
    const files = fakeProject()
    const result = await compose(withPlugins([projectSkillsPlugin()]), files, 'anything')
    const skills = blockOf(result, PromptBlock.Skills)
    expect(skills).toContain('- auth — How this project authenticates.')
    expect(skills).toContain('- deploy — How this project ships.')
  })

  test('a file with invalid frontmatter never reaches the index', async () => {
    const files = fakeProject()
    const result = await compose(withPlugins([projectSkillsPlugin()]), files, 'anything')
    const skills = blockOf(result, PromptBlock.Skills)
    expect(skills).not.toContain('broken')
    expect(skills).not.toContain('mismatched')
  })

  test('no signal means no bodies at all', async () => {
    const files = fakeProject()
    const result = await compose(withPlugins([projectSkillsPlugin()]), files, 'anything')
    expect(blockOf(result, PromptBlock.Packages)).toBeUndefined()
  })

  test('a matching rule loads exactly that skill body', async () => {
    const files = fakeProject()
    const svc = withPlugins([projectSkillsPlugin({
      rules: [{ skills: ['deploy'], when: { mention: ['ship it'] } }],
    })])
    const result = await compose(svc, files, 'Time to ship it to production')
    expect(blockOf(result, PromptBlock.Packages)).toContain('DEPLOY BODY')
    expect(blockOf(result, PromptBlock.Packages)).not.toContain('AUTH BODY')
  })

  test('a rule that does not match loads nothing', async () => {
    const files = fakeProject()
    const svc = withPlugins([projectSkillsPlugin({
      rules: [{ skills: ['deploy'], when: { mention: ['ship it'] } }],
    })])
    expect(blockOf(await compose(svc, files, 'unrelated question'), PromptBlock.Packages))
      .toBeUndefined()
  })

  test('a path rule fires on a path-shaped token in the request', async () => {
    const files = fakeProject()
    const svc = withPlugins([projectSkillsPlugin({
      rules: [{ skills: ['deploy'], when: { paths: ['*.yaml'] } }],
    })])
    const result = await compose(svc, files, 'patch charts/api/values.yaml please')
    expect(blockOf(result, PromptBlock.Packages)).toContain('DEPLOY BODY')
  })

  test('a skill the host registry already resolves is excluded from the index', async () => {
    const files = fakeProject()
    const svc = withPlugins([projectSkillsPlugin()])
    svc.register({ alias: 'auth', body: 'REGISTERED AUTH' })
    const result = await compose(svc, files, 'anything', { skills: ['auth'] })
    const skills = blockOf(result, PromptBlock.Skills)
    expect(skills).toContain('- deploy —')
    expect(skills).not.toContain('- auth —')
    expect(skills).toContain('REGISTERED AUTH')
  })

  // Both plugins can render a skill called `auth`. The package plugin runs first because a
  // mention of the package is the more specific signal; the project plugin must stand down.
  test('a body claimed by the package plugin is not rendered twice', async () => {
    const files = fakeProject({
      ...FILES,
      '.agents/skills/auth/SKILL.md': skillFile('auth', 'The project copy.', 'PROJECT AUTH BODY'),
      'node_modules/@owlmeans/auth/agent-meta/manifest.json': JSON.stringify({
        schemaVersion: 2,
        package: '@owlmeans/auth',
        version: '9.9.9',
        generatedAt: '',
        canonicalRepo: '',
        entries: [{
          kind: 'skill',
          name: 'auth',
          category: 'package-specific',
          file: 'skills/auth/SKILL.md',
          canonicalPath: '.agents/skills/auth/SKILL.md',
        }],
      }),
      'node_modules/@owlmeans/auth/agent-meta/skills/auth/SKILL.md':
        skillFile('auth', 'The package.', 'PACKAGE AUTH BODY'),
    })
    const svc = withPlugins([
      owlmeansPackagesPlugin({ fetch: false }),
      projectSkillsPlugin({ rules: [{ skills: ['auth'], when: { mention: ['@owlmeans/auth'] } }] }),
    ])
    const packages = blockOf(
      await compose(svc, files, 'how does @owlmeans/auth work?'), PromptBlock.Packages
    ) ?? ''
    expect(packages).toContain('PACKAGE AUTH BODY')
    expect(packages).not.toContain('PROJECT AUTH BODY')
    expect(packages.split('@owlmeans/auth — auth').length - 1).toBe(1)
  })

  test('two composes of the same project produce identical bytes', async () => {
    const files = fakeProject()
    const svc = withPlugins([projectSkillsPlugin({
      rules: [{ skills: ['deploy'], when: { mention: ['ship it'] } }],
    })])
    const first = await compose(svc, files, 'ship it')
    const second = await compose(svc, files, 'ship it')
    expect(blockOf(second, PromptBlock.Skills)).toBe(blockOf(first, PromptBlock.Skills)!)
    expect(blockOf(second, PromptBlock.Packages)).toBe(blockOf(first, PromptBlock.Packages)!)
  })

  test('a second compose reads no files', async () => {
    const files = fakeProject()
    const svc = withPlugins([projectSkillsPlugin()])
    await compose(svc, files, 'anything')
    expect(files.reads.length).toBeGreaterThan(0)
    files.reads.length = 0
    await compose(svc, files, 'anything else')
    expect(files.reads).toEqual([])
  })

  test('invalidating a project makes the next compose read it again', async () => {
    const files = fakeProject()
    const svc = withPlugins([projectSkillsPlugin()])
    await compose(svc, files, 'anything')
    files.reads.length = 0
    invalidateProjectSkills(files.key)
    await compose(svc, files, 'anything')
    expect(files.reads.length).toBeGreaterThan(0)
  })

  test('a call without a file provider contributes nothing', async () => {
    const svc = withPlugins([projectSkillsPlugin()])
    const result = await svc.compose(
      {}, [{ role: 'user', content: 'anything' }], { model, provider: anthropicPlugin },
    )
    expect(blockOf(result, PromptBlock.Skills)).toBeUndefined()
  })
})
