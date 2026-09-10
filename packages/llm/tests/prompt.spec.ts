import { describe, expect, test } from 'bun:test'
import { PromptBlock } from '@owlmeans/llm-common'
import type { SkillDefinition } from '@owlmeans/llm-common'
import { anthropicPlugin, makePromptService } from '@owlmeans/llm'
import type { LlmPromptPlugin, ModelConfig, PromptService } from '@owlmeans/llm'

/** `cacheMinTokens: 1` puts the cacheable minimum at 4 characters so fixtures stay short. */
const model = anthropicPlugin.build({
  alias: 'spec',
  secret: 'sk-test',
  callbacks: [],
  config: { alias: 'spec', model: 'claude-haiku-4-5-20251001', cacheMinTokens: 1 } as ModelConfig,
})

let seq = 0
const service = (skills: SkillDefinition[] = [], plugins: LlmPromptPlugin[] = []): PromptService =>
  makePromptService({ skills, plugins }, `spec-prompt-${seq++}`)

const compose = (svc: PromptService, input: Parameters<PromptService['compose']>[0] = {}) =>
  svc.compose(input, [{ role: 'user', content: 'the task' }], { model, provider: anthropicPlugin })

const skill = (alias: string, body: string, extra: Partial<SkillDefinition> = {}): SkillDefinition =>
  ({ alias, body, ...extra })

describe('@owlmeans/llm — skill registry', () => {
  test('resolve follows requires depth-first and de-duplicates', () => {
    const svc = service([
      skill('a', 'A', { requires: ['b', 'c'] }),
      skill('b', 'B', { requires: ['c'] }),
      skill('c', 'C'),
    ])
    expect(svc.resolve(['a']).map(s => s.alias)).toEqual(['c', 'b', 'a'])
    expect(svc.resolve(['a', 'b', 'c']).map(s => s.alias)).toEqual(['c', 'b', 'a'])
  })

  // A catalogue is assembled from several packages; a missing optional entry should
  // degrade the prompt, not break the call.
  test('an unknown alias is skipped rather than thrown', () => {
    const svc = service([skill('known', 'K')])
    expect(svc.resolve(['known', 'missing']).map(s => s.alias)).toEqual(['known'])
    expect(svc.has('missing')).toBe(false)
  })

  test('a cyclic requires graph terminates', () => {
    const svc = service([skill('a', 'A', { requires: ['b'] }), skill('b', 'B', { requires: ['a'] })])
    expect(svc.resolve(['a']).map(s => s.alias).sort()).toEqual(['a', 'b'])
  })
})

describe('@owlmeans/llm — prompt composition', () => {
  test('blocks are emitted in stability order regardless of who contributed them', async () => {
    const late: LlmPromptPlugin = {
      alias: 'late', order: 99, compose: ctx => ctx.add(PromptBlock.Packages, 'package text'),
    }
    const result = await compose(
      service([skill('s', 'skill text')], [late]),
      { role: 'role text', skills: ['s'], context: ['context text'] },
    )
    expect(result.blocks.map(block => block.block))
      .toEqual([PromptBlock.Role, PromptBlock.Skills, PromptBlock.Packages, PromptBlock.Context])
  })

  // The whole design rests on this: a prompt cache is a byte-exact prefix match, so two
  // calls that declare the same thing must render the same thing.
  test('the same declaration composes to identical bytes', async () => {
    const svc = service([skill('a', 'A'), skill('b', 'B')])
    const first = await compose(svc, { role: 'R', skills: ['a', 'b'] })
    const second = await compose(svc, { role: 'R', skills: ['b', 'a'] })
    expect(JSON.stringify(second.system)).toBe(JSON.stringify(first.system))
  })

  test('skill order comes from the definitions, not from registration or request order', async () => {
    const forward = service([skill('z', 'Z', { order: 1 }), skill('a', 'A', { order: 2 })])
    const backward = service([skill('a', 'A', { order: 2 }), skill('z', 'Z', { order: 1 })])
    const one = await compose(forward, { skills: ['a', 'z'] })
    const two = await compose(backward, { skills: ['z', 'a'] })
    expect(one.blocks[0]!.text).toBe(two.blocks[0]!.text)
    expect(one.blocks[0]!.text.indexOf('## z')).toBeLessThan(one.blocks[0]!.text.indexOf('## a'))
  })

  // The reason packages get their own block: whatever a request happens to mention must
  // not shift a single byte of the region every call shares.
  test('a changing packages block leaves the cached region byte-identical', async () => {
    const inject = (text: string): LlmPromptPlugin =>
      ({ alias: 'pkg', inspect: ctx => ctx.add(PromptBlock.Packages, text) })
    const base = { role: 'R', skills: ['a'] }
    const one = await compose(service([skill('a', 'A')], [inject('first')]), base)
    const two = await compose(service([skill('a', 'A')], [inject('second')]), base)

    const stable = (blocks: typeof one.blocks) =>
      blocks.filter(b => b.block !== PromptBlock.Packages).map(b => b.text).join('|')
    expect(stable(two.blocks)).toBe(stable(one.blocks))
    expect(two.blocks.find(b => b.block === PromptBlock.Packages)?.text).toBe('second')
  })

  test('per-call skills render into the volatile context block, not the cached one', async () => {
    const result = await compose(
      service([skill('static', 'S'), skill('percall', 'P')]),
      { skills: ['static'], callSkills: ['percall'] },
    )
    expect(result.blocks.find(b => b.block === PromptBlock.Skills)?.text).toContain('## static')
    expect(result.blocks.find(b => b.block === PromptBlock.Skills)?.text).not.toContain('## percall')
    expect(result.blocks.find(b => b.block === PromptBlock.Context)?.text).toContain('## percall')
  })

  test('an inline skill overrides the registered one of the same alias', async () => {
    const result = await compose(
      service([skill('a', 'registered body')]),
      { skills: ['a'], inline: [skill('a', 'inline body')] },
    )
    expect(result.blocks[0]!.text).toContain('inline body')
    expect(result.blocks[0]!.text).not.toContain('registered body')
  })

  test('registering the same plugin alias twice replaces it instead of emitting twice', async () => {
    const svc = service()
    const plugin: LlmPromptPlugin = {
      alias: 'dup', compose: ctx => ctx.add(PromptBlock.Skills, 'once'),
    }
    svc.use(plugin)
    svc.use(plugin)
    const result = await compose(svc)
    expect(result.blocks[0]!.text).toBe('once')
  })

  // Detection plugins need every static contribution already in place.
  test('every compose pass runs before the first inspect pass', async () => {
    const seen: string[] = []
    const plugins: LlmPromptPlugin[] = [
      { alias: 'x', order: 1, compose: () => { seen.push('compose:x') }, inspect: () => { seen.push('inspect:x') } },
      { alias: 'y', order: 2, compose: () => { seen.push('compose:y') } },
    ]
    await compose(service([], plugins))
    expect(seen).toEqual(['compose:x', 'compose:y', 'inspect:x'])
  })

  // Volatile parts are merged rather than emitted separately: the block carries no
  // breakpoint, so keeping them separable buys nothing and reads worse to the model.
  test('every volatile part lands in a single context chunk', async () => {
    const result = await compose(
      service([skill('a', 'A'), skill('percall', 'P')]),
      { skills: ['a'], callSkills: ['percall'], context: ['first note', 'second note'] },
    )
    const context = result.blocks.filter(block => block.block === PromptBlock.Context)
    expect(context).toHaveLength(1)
    expect(context[0]!.text).toContain('## percall')
    expect(context[0]!.text).toContain('first note')
    expect(context[0]!.text).toContain('second note')
  })

  // Two plugins can each be able to render the same skill — a static catalogue and a
  // detector. Without the claim they both do, and the model is told the same thing twice.
  test('a key is claimed by the first plugin only, within one composition', async () => {
    const grants: boolean[] = []
    const claimer = (alias: string): LlmPromptPlugin => ({
      alias,
      compose: ctx => {
        if (ctx.claim('skill:a')) {
          ctx.add(PromptBlock.Packages, `from ${alias}`)
        }
        grants.push(ctx.claim('probe'))
      },
    })
    const result = await compose(service([], [claimer('first'), claimer('second')]))

    expect(grants).toEqual([true, false])
    expect(result.blocks.find(b => b.block === PromptBlock.Packages)?.text).toBe('from first')
  })

  test('the claim set is per composition, not per service', async () => {
    const svc = service([], [{
      alias: 'claimer', compose: ctx => ctx.add(PromptBlock.Packages, `${ctx.claim('once')}`),
    }])
    const first = await compose(svc)
    const second = await compose(svc)

    expect(first.blocks[0]!.text).toBe('true')
    expect(second.blocks[0]!.text).toBe('true')
  })

  // The seam has to be free: a composition where nobody claims must render the bytes it
  // rendered before the seam existed, or every cached prefix in the fleet is invalidated.
  test('claiming nothing changes nothing about the composed bytes', async () => {
    const input = { role: 'R', skills: ['a'], context: ['note'] }
    const plain = await compose(service([skill('a', 'A')]), input)
    const claiming = await compose(
      service([skill('a', 'A')], [{ alias: 'quiet', compose: ctx => { ctx.claim('a') } }]),
      input,
    )
    expect(JSON.stringify(claiming.system)).toBe(JSON.stringify(plain.system))
    expect(claiming.breakpoints).toBe(plain.breakpoints)
  })

  test('nothing declared composes to no system message at all', async () => {
    const result = await compose(service())
    expect(result.system).toBeNull()
    expect(result.breakpoints).toBe(0)
  })
})

describe('@owlmeans/llm — composed prompt caching', () => {
  test('the system prompt is cached by default, and marks its boundaries', async () => {
    const result = await compose(
      service([skill('a', 'A')], [{ alias: 'pkg', inspect: ctx => ctx.add(PromptBlock.Packages, 'pkg') }]),
      { role: 'R', skills: ['a'] },
    )
    expect(result.breakpoints).toBe(2)
    expect(Array.isArray(result.system?.content)).toBe(true)
  })

  test('opting out yields a plain joined string and spends no breakpoints', async () => {
    const result = await compose(service([skill('a', 'A')]), { role: 'R', skills: ['a'], cacheSystem: false })
    expect(result.breakpoints).toBe(0)
    expect(typeof result.system?.content).toBe('string')
    expect(result.system?.content).toContain('## a')
  })

  test('a provider without explicit markers still gets the blocks, in order', async () => {
    const svc = service([skill('a', 'A')])
    const result = await svc.compose({ role: 'R', skills: ['a'] }, [], { model })
    expect(result.breakpoints).toBe(0)
    expect(result.system?.content).toBe('R\n\n## a\n\nA')
  })

  // Two stable boundaries at most, so the messages always keep half the request budget.
  test('the system prompt never spends more than half the request budget', async () => {
    const noisy: LlmPromptPlugin = {
      alias: 'noisy',
      compose: ctx => {
        ctx.add(PromptBlock.Packages, 'pkg')
        ctx.add(PromptBlock.Context, 'ctx')
      },
    }
    const result = await compose(service([skill('a', 'A')], [noisy]), { role: 'R', skills: ['a'] })
    expect(result.breakpoints).toBeLessThanOrEqual(2)
  })
})
