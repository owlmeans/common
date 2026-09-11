import { describe, expect, test } from 'bun:test'
import { PromptBlock } from '@owlmeans/llm-common'
import type { LlmFileProvider } from '@owlmeans/llm-common'
import { anthropicPlugin, makePromptService } from '@owlmeans/llm'
import type { ModelConfig, PromptService } from '@owlmeans/llm'
import { owlmeansPackagesPlugin, stripMeta, unscoped } from '@owlmeans/agent-skills/llm'

const model = anthropicPlugin.build({
  alias: 'spec',
  secret: 'sk-test',
  callbacks: [],
  config: { alias: 'spec', model: 'claude-haiku-4-5-20251001' } as ModelConfig,
})

let seq = 0
const compose = (svc: PromptService, text: string) =>
  svc.compose({}, [{ role: 'user', content: text }], { model, provider: anthropicPlugin })

const withPlugin = (options: Parameters<typeof owlmeansPackagesPlugin>[0] = {}): PromptService =>
  makePromptService(
    { plugins: [owlmeansPackagesPlugin({ fetch: false, ...options })] },
    `spec-pkg-${seq++}`,
  )

/** A host file provider that serves one package, recording every path it is asked for. */
const fakeProvider = (asked: string[], body: string): LlmFileProvider => ({
  getSourceList: async () => [],
  writeFile: async () => { },
  deleteFile: async () => { },
  readFile: async path => {
    asked.push(path)
    if (path.endsWith('manifest.json')) {
      return JSON.stringify({
        schemaVersion: 1,
        package: '@owlmeans/auth',
        version: '9.9.9',
        generatedAt: '',
        canonicalRepo: '',
        entries: [{
          kind: 'skill',
          name: 'auth',
          category: 'package-specific',
          file: 'skills/auth/SKILL.md',
          canonicalPath: '.claude/skills/auth/SKILL.md',
        }],
      })
    }
    return `---\nname: auth\n---\n${body}`
  },
})

describe('@owlmeans/agent-skills — embedded metadata', () => {
  test('frontmatter and the generated banner are stripped from a skill body', () => {
    const body = stripMeta([
      '---',
      'name: auth',
      'description: something',
      '---',
      '<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->',
      '',
      '# @owlmeans/auth',
    ].join('\n'))
    expect(body).toBe('# @owlmeans/auth')
  })

  test('content without frontmatter survives untouched', () => {
    expect(stripMeta('# Plain\n\nbody')).toBe('# Plain\n\nbody')
  })

  test('the repo lays packages out under their unscoped name', () => {
    expect(unscoped('@owlmeans/llm-common')).toBe('llm-common')
  })
})

describe('@owlmeans/agent-skills — package skills plugin', () => {
  test('a mentioned package contributes its skills to the packages block', async () => {
    const result = await compose(withPlugin(), 'How do I use @owlmeans/auth in a handler?')
    const packages = result.blocks.find(block => block.block === PromptBlock.Packages)
    expect(packages?.text).toContain('@owlmeans/auth — auth')
  })

  test('a package nobody mentioned is not loaded', async () => {
    const result = await compose(withPlugin(), 'How do I write a handler?')
    expect(result.blocks.find(block => block.block === PromptBlock.Packages)).toBeUndefined()
  })

  test('an excluded package is skipped even when mentioned', async () => {
    const result = await compose(
      withPlugin({ exclude: ['@owlmeans/auth'] }), 'How do I use @owlmeans/auth?'
    )
    expect(result.blocks.find(block => block.block === PromptBlock.Packages)).toBeUndefined()
  })

  // Two prompts that name the same packages in a different order must produce the same
  // bytes, or they can never share a cache entry.
  test('mention order does not change the composed bytes', async () => {
    const first = await compose(withPlugin(), 'compare @owlmeans/auth with @owlmeans/context')
    const second = await compose(withPlugin(), 'compare @owlmeans/context with @owlmeans/auth')
    const packages = (result: typeof first) =>
      result.blocks.find(block => block.block === PromptBlock.Packages)?.text
    expect(packages(second)).toBe(packages(first))
  })

  test('trailing punctuation is not part of the package name', async () => {
    const result = await compose(withPlugin(), 'What about @owlmeans/auth. And @owlmeans/auth,')
    expect(result.blocks.find(block => block.block === PromptBlock.Packages)?.text)
      .toContain('@owlmeans/auth — auth')
  })

  test('a provider wired at construction is preferred over the local filesystem', async () => {
    const asked: string[] = []
    const files = fakeProvider(asked, 'HOSTED BODY')
    const result = await compose(withPlugin({ files: () => files }), 'about @owlmeans/auth')
    expect(asked[0]).toBe('node_modules/@owlmeans/auth/agent-meta/manifest.json')
    expect(result.blocks.find(block => block.block === PromptBlock.Packages)?.text)
      .toContain('HOSTED BODY')
  })

  // The host's provider is per-execution (a sandbox, a slot, one checkout), so it can only
  // arrive on the compose context — a plugin built once at context composition cannot know
  // it. Reading only the constructor option left this path dead.
  test('a provider supplied on the compose context is used and preferred', async () => {
    const asked: string[] = []
    const files = fakeProvider(asked, 'CONTEXT BODY')
    const svc = withPlugin()
    const result = await svc.compose(
      {},
      [{ role: 'user', content: 'about @owlmeans/auth' }],
      { model, provider: anthropicPlugin, files: () => files },
    )
    expect(asked[0]).toBe('node_modules/@owlmeans/auth/agent-meta/manifest.json')
    expect(result.blocks.find(block => block.block === PromptBlock.Packages)?.text)
      .toContain('CONTEXT BODY')
  })

  test('two providers do not share each other\'s cached packages', async () => {
    const svc = withPlugin()
    const one = fakeProvider([], 'FIRST PROJECT')
    const two = fakeProvider([], 'SECOND PROJECT')
    const run = (files: LlmFileProvider) => svc.compose(
      {},
      [{ role: 'user', content: 'about @owlmeans/auth' }],
      { model, provider: anthropicPlugin, files: () => files },
    )
    const first = await run(one)
    const second = await run(two)
    const packages = (r: typeof first) =>
      r.blocks.find(block => block.block === PromptBlock.Packages)?.text
    expect(packages(first)).toContain('FIRST PROJECT')
    expect(packages(second)).toContain('SECOND PROJECT')
  })

  // A prompt plugin that throws takes the whole model call with it.
  test('an unreachable package degrades the prompt instead of failing the call', async () => {
    const result = await compose(withPlugin(), 'about @owlmeans/does-not-exist-anywhere')
    expect(result.blocks.find(block => block.block === PromptBlock.Packages)).toBeUndefined()
  })
})
