import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PackagePurpose, PromptBlock } from '@owlmeans/llm-common'
import type { LlmFileProvider, PromptFocus } from '@owlmeans/llm-common'
import { anthropicPlugin, makePromptService } from '@owlmeans/llm'
import type { ModelConfig, PromptService } from '@owlmeans/llm'
import { loadPackageSkills, manifestHelper, owlmeansPackagesPlugin } from '@owlmeans/agent-skills/llm'

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
    const body = manifestHelper.stripMeta([
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
    expect(manifestHelper.stripMeta('# Plain\n\nbody')).toBe('# Plain\n\nbody')
  })

  test('the repo lays packages out under their unscoped name', () => {
    expect(manifestHelper.unscoped('@owlmeans/llm-common')).toBe('llm-common')
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

/**
 * A checkout of the canonical repository replaces GitHub: the same `packages/<name>/agent-meta/`
 * files, read from disk. The package names are ones no `node_modules` holds, so the local walk
 * misses and what is asserted is the third source alone.
 */
describe('@owlmeans/agent-skills — a local checkout in place of GitHub', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  /** A fetch that records every URL and answers from a table. */
  const fakeFetch = (answers: Record<string, string> = {}): string[] => {
    const asked: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      asked.push(url)
      const hit = Object.entries(answers).find(([key]) => url.endsWith(key))
      return hit != null ? new Response(hit[1], { status: 200 }) : new Response('', { status: 404 })
    }) as typeof fetch
    return asked
  }

  const manifestOf = (name: string): string => JSON.stringify({
    schemaVersion: 2,
    package: `@owlmeans/${name}`,
    version: '0.0.1-fixture',
    generatedAt: '',
    canonicalRepo: '',
    entries: [{
      kind: 'skill', name, category: 'package-specific',
      file: `skills/${name}/SKILL.md`, canonicalPath: `.agents/skills/${name}/SKILL.md`,
    }],
  })

  /** A synthetic checkout with one package whose skill carries a `## Target wiring` section. */
  const checkout = (name: string): string => {
    const root = mkdtempSync(join(tmpdir(), 'agent-skills-checkout-'))
    const meta = join(root, 'packages', name, 'agent-meta')
    mkdirSync(join(meta, 'skills', name), { recursive: true })
    writeFileSync(join(meta, 'manifest.json'), manifestOf(name))
    writeFileSync(join(meta, 'skills', name, 'SKILL.md'),
      `---\nname: ${name}\n---\n# CHECKOUT BODY\n\n## Target wiring\n\n| a | b |\n`)
    return root
  }

  test('a configured checkout serves the package, and GitHub is never asked', async () => {
    const asked = fakeFetch()
    const root = checkout('zz-checkout-fixture')
    const found = await loadPackageSkills(
      '@owlmeans/zz-checkout-fixture', { localRoot: root, dir: root, ref: 'never-read' }, ['package-specific'],
    )
    expect(found?.source).toBe('checkout')
    expect(found?.version).toBe('0.0.1-fixture')
    expect(found?.skills[0]?.body).toContain('## Target wiring')
    expect(found?.skills[0]?.body).not.toContain('name: zz-checkout-fixture')
    expect(asked).toEqual([])
  })

  test('a package the checkout lacks is a miss, not a GitHub fallback', async () => {
    const asked = fakeFetch({ 'manifest.json': manifestOf('zz-absent-fixture'), 'SKILL.md': '# REMOTE' })
    const root = checkout('zz-checkout-fixture')
    expect(await loadPackageSkills(
      '@owlmeans/zz-absent-fixture', { localRoot: root, dir: root }, ['package-specific'],
    )).toBeNull()
    // A name that would climb out of `packages/` is never joined onto the root.
    expect(await loadPackageSkills(
      '@owlmeans/../zz-checkout-fixture', { localRoot: root, dir: root }, ['package-specific'],
    )).toBeNull()
    expect(asked).toEqual([])
  })

  test('without a checkout, the GitHub fallback is read at the ref exactly as before', async () => {
    const asked = fakeFetch({
      'manifest.json': manifestOf('zz-remote-fixture'),
      'skills/zz-remote-fixture/SKILL.md': '---\nname: zz-remote-fixture\n---\n# REMOTE BODY',
    })
    const dir = mkdtempSync(join(tmpdir(), 'agent-skills-remote-'))
    const found = await loadPackageSkills(
      '@owlmeans/zz-remote-fixture', { dir, ref: 'spec-ref' }, ['package-specific'],
    )
    expect(found?.source).toBe('remote')
    expect(found?.skills[0]?.body).toBe('# REMOTE BODY')
    expect(asked[0]).toBe(
      'https://raw.githubusercontent.com/owlmeans/common/spec-ref/packages/zz-remote-fixture/agent-meta/manifest.json',
    )
  })

  test('the plugin composes a checkout\'s skill into the packages block', async () => {
    const asked = fakeFetch()
    const root = checkout('zz-plugin-fixture')
    const result = await compose(
      withPlugin({ localRoot: root, dir: root }), 'build it on @owlmeans/zz-plugin-fixture',
    )
    expect(result.blocks.find(block => block.block === PromptBlock.Packages)?.text)
      .toContain('CHECKOUT BODY')
    expect(asked).toEqual([])
  })
})

/**
 * Chunked package skills — a v3 manifest's core plus purpose parts, chosen by a focus or by the
 * messages. All fixtures live in one synthetic checkout read in place of GitHub, so nothing here
 * touches the network or an installed package.
 */
describe('@owlmeans/agent-skills — chunked skills (manifest v3)', () => {
  interface FixturePart { purposes: string[]; mentions: string[]; body?: string }

  /** One package in a checkout: a core plus parts, under the given manifest schema. */
  const writePackage = (
    root: string,
    name: string,
    parts: Record<string, FixturePart> = {},
    opts: { schemaVersion?: number; core?: string } = {},
  ): void => {
    const meta = join(root, 'packages', name, 'agent-meta')
    mkdirSync(join(meta, 'skills', name, 'parts'), { recursive: true })
    writeFileSync(join(meta, 'skills', name, 'SKILL.md'),
      `---\nname: ${name}\n---\n<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->\n${opts.core ?? `# CORE ${name}`}\n`)
    for (const [part, spec] of Object.entries(parts)) {
      writeFileSync(join(meta, 'skills', name, 'parts', `${part}.md`),
        `---\nname: ${part}\nmetadata:\n  purposes: SHOULD-NOT-BE-READ\n---\n${spec.body ?? `# PART ${name}/${part}`}\n`)
    }
    writeFileSync(join(meta, 'manifest.json'), JSON.stringify({
      schemaVersion: opts.schemaVersion ?? 3,
      package: `@owlmeans/${name}`,
      version: '0.0.3-fixture',
      generatedAt: '',
      canonicalRepo: '',
      entries: [{
        kind: 'skill', name, category: 'package-specific',
        file: `skills/${name}/SKILL.md`, canonicalPath: `.agents/skills/${name}/SKILL.md`,
        parts: Object.entries(parts).map(([part, spec]) => ({
          name: part, file: `skills/${name}/parts/${part}.md`, description: part,
          purposes: spec.purposes, mentions: spec.mentions,
        })),
      }],
    }))
  }

  const root = mkdtempSync(join(tmpdir(), 'agent-skills-parts-'))
  writePackage(root, 'zz-split', {
    theme: { purposes: ['theme'], mentions: ['ThemeToggle'] },
    picker: { purposes: ['picker', 'form'], mentions: ['IconPicker', '@owlmeans/zz-split/picker'] },
    navigation: { purposes: ['navigation', 'layout'], mentions: ['NavLayout'] },
  })
  writePackage(root, 'zz-old', { navigation: { purposes: ['navigation'], mentions: ['NavLayout'] } }, { schemaVersion: 2 })
  for (const name of ['zz-late-a', 'zz-late-b', 'zz-late-c', 'zz-late-d']) writePackage(root, name)
  writePackage(root, 'zz-late-big', {}, { core: `# CORE zz-late-big\n${'b'.repeat(2_000)}` })
  writePackage(root, 'aa-named')

  const plugin = (options: Parameters<typeof owlmeansPackagesPlugin>[0] = {}): PromptService =>
    withPlugin({ localRoot: root, dir: root, ...options })

  const run = async (svc: PromptService, text: string, focus?: PromptFocus) => {
    const result = await svc.compose(
      focus != null ? { focus } : {},
      [{ role: 'user', content: text }],
      { model, provider: anthropicPlugin },
    )
    return {
      packages: result.blocks.find(block => block.block === PromptBlock.Packages)?.text ?? '',
      tail: result.blocks.find(block => block.block === PromptBlock.Tail)?.text ?? '',
    }
  }

  test('focus: the core, then the parts whose purposes meet the focus, in name order', async () => {
    const { packages } = await run(plugin(), 'irrelevant', { packages: ['@owlmeans/zz-split'], purposes: [PackagePurpose.Form, PackagePurpose.Navigation] })
    expect(packages).toContain('# CORE zz-split')
    expect(packages).toContain('# PART zz-split/navigation')
    expect(packages).toContain('# PART zz-split/picker')
    expect(packages).not.toContain('# PART zz-split/theme')
    expect(packages.indexOf('# CORE zz-split')).toBeLessThan(packages.indexOf('# PART zz-split/navigation'))
    expect(packages.indexOf('# PART zz-split/navigation')).toBeLessThan(packages.indexOf('# PART zz-split/picker'))
    expect(packages).toContain('## @owlmeans/zz-split — zz-split / picker')
  })

  test('focus: a part named as <package>#<part> loads without a matching purpose', async () => {
    const { packages } = await run(plugin(), 'x', { packages: ['@owlmeans/zz-split'], parts: ['@owlmeans/zz-split#theme'] })
    expect(packages).toContain('# PART zz-split/theme')
    expect(packages).not.toContain('# PART zz-split/picker')
  })

  test('focus: purposes and mentions come from the manifest, never the part file', async () => {
    const { packages } = await run(plugin(), 'x', { packages: ['@owlmeans/zz-split'], purposes: [PackagePurpose.Theme] })
    expect(packages).toContain('# PART zz-split/theme')
    expect(packages).not.toContain('SHOULD-NOT-BE-READ')
  })

  test('focus: the packages block is byte-stable whatever the messages say', async () => {
    const focus: PromptFocus = { packages: ['@owlmeans/zz-split'], purposes: [PackagePurpose.Picker], late: false }
    const one = await run(plugin(), 'use NavLayout and @owlmeans/aa-named', focus)
    const two = await run(plugin(), 'something else entirely, ThemeToggle', focus)
    expect(one.packages).not.toBe('')
    expect(two.packages).toBe(one.packages)
    expect(one.packages).not.toContain('# CORE aa-named')
    expect(one.packages).not.toContain('# PART zz-split/navigation')
  })

  test('focus: an empty package list loads nothing', async () => {
    const { packages, tail } = await run(plugin(), "import { x } from '@owlmeans/zz-split'", { packages: [], late: false })
    expect(packages).toBe('')
    expect(tail).toBe('')
  })

  test('late: an imported package the focus lacks goes to the Tail, cores only', async () => {
    const code = "import { a } from '@owlmeans/zz-late-a'\nimport { NavLayout } from '@owlmeans/zz-split/picker'\nsee @owlmeans/aa-named"
    const { packages, tail } = await run(plugin(), code, { packages: ['@owlmeans/zz-old'] })
    expect(packages).toContain('# CORE zz-old')
    expect(tail).toContain('# CORE zz-late-a')
    expect(tail).toContain('# CORE zz-split')
    expect(tail).not.toContain('# PART')
    expect(tail).not.toContain('# CORE aa-named')
    expect(packages).not.toContain('zz-late-a')
  })

  test('late: capped at 3 packages, and a package over the char budget is skipped', async () => {
    const code = ['zz-late-d', 'zz-late-c', 'zz-late-b', 'zz-late-a', 'zz-late-big']
      .map(name => `import x from "@owlmeans/${name}"`).join('\n')
    // Name order: a, b, big, c, d — the first three fit the default 24k budget.
    const capped = await run(plugin(), code, { packages: [] })
    expect(['a', 'b', 'big'].every(n => capped.tail.includes(`# CORE zz-late-${n}`))).toBe(true)
    expect(capped.tail).not.toContain('# CORE zz-late-c')
    expect(capped.tail).not.toContain('# CORE zz-late-d')

    const tight = await run(plugin({ lateMaxChars: 1_000, lateMaxPackages: 10 }), code, { packages: [] })
    expect(tight.tail).not.toContain('# CORE zz-late-big')
    expect(['a', 'b', 'c', 'd'].every(n => tight.tail.includes(`# CORE zz-late-${n}`))).toBe(true)
  })

  test('late: false keeps the prompt to the focus', async () => {
    const { tail } = await run(plugin(), "import a from '@owlmeans/zz-late-a'", { packages: [], late: false })
    expect(tail).toBe('')
  })

  test('a v2 manifest gives the core only, even when it lists parts', async () => {
    const { packages } = await run(plugin(), 'NavLayout', { packages: ['@owlmeans/zz-old'], purposes: [PackagePurpose.Navigation] })
    expect(packages).toContain('# CORE zz-old')
    expect(packages).not.toContain('# PART')
    const found = await loadPackageSkills('@owlmeans/zz-old', { localRoot: root, dir: root }, ['package-specific'])
    expect(found?.parts).toEqual([])
  })

  test('detect: the core plus the parts whose mentions appear in the messages', async () => {
    const { packages } = await run(plugin(), 'Wrap the page in NavLayout from @owlmeans/zz-split.')
    expect(packages).toContain('# CORE zz-split')
    expect(packages).toContain('# PART zz-split/navigation')
    expect(packages).not.toContain('# PART zz-split/picker')
    expect(packages).not.toContain('# PART zz-split/theme')
    // A mention is a whole token: `ThemeToggleButton` is not `ThemeToggle`.
    const partial = await run(plugin(), 'ThemeToggleButton in @owlmeans/zz-split')
    expect(partial.packages).not.toContain('# PART zz-split/theme')
  })

  test('detect: an import specifier mention selects its part', async () => {
    const { packages } = await run(plugin(), "import { IconPicker as P } from '@owlmeans/zz-split/picker'")
    expect(packages).toContain('# PART zz-split/picker')
  })

  test('detect: imported packages rank before merely named ones under the cap', async () => {
    const text = "Compare with @owlmeans/aa-named.\nimport { x } from '@owlmeans/zz-split'"
    const { packages } = await run(plugin({ maxPackages: 1 }), text)
    expect(packages).toContain('# CORE zz-split')
    expect(packages).not.toContain('# CORE aa-named')
    const both = await run(plugin({ maxPackages: 2 }), text)
    expect(both.packages.indexOf('# CORE aa-named')).toBeLessThan(both.packages.indexOf('# CORE zz-split'))
  })
})
