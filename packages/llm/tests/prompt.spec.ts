import { describe, expect, test } from 'bun:test'
import { PromptBlock, PromptRegion } from '@owlmeans/llm-common'
import type { SkillDefinition } from '@owlmeans/llm-common'
import { anthropicPlugin, makePromptService, PROJECT_CONTEXT_HEADER } from '@owlmeans/llm'
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

  test('per-call skills render into the uncached tail, not the cached skills block', async () => {
    const result = await compose(
      service([skill('static', 'S'), skill('percall', 'P')]),
      { skills: ['static'], callSkills: ['percall'] },
    )
    expect(result.blocks.find(b => b.block === PromptBlock.Skills)?.text).toContain('## static')
    expect(result.blocks.find(b => b.block === PromptBlock.Skills)?.text).not.toContain('## percall')
    expect(result.blocks.find(b => b.block === PromptBlock.Tail)?.text).toContain('## percall')
    expect(result.tail).toBe('## percall\n\nP')
    expect(result.system).not.toContain('## percall')
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

  // A region's parts are merged rather than emitted separately: keeping them separable buys
  // nothing and reads worse to the model.
  test('the caller\'s text lands in one context chunk, the per-call skills in one tail chunk', async () => {
    const result = await compose(
      service([skill('a', 'A'), skill('percall', 'P')]),
      { skills: ['a'], callSkills: ['percall'], context: ['first note', 'second note'] },
    )
    const context = result.blocks.filter(block => block.block === PromptBlock.Context)
    expect(context).toHaveLength(1)
    expect(context[0]!.text).toBe('first note\n\nsecond note')
    expect(result.blocks.filter(block => block.block === PromptBlock.Tail)).toHaveLength(1)
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
    expect(JSON.stringify(claiming)).toBe(JSON.stringify(plain))
  })

  test('nothing declared composes to no message at all', async () => {
    const result = await compose(service())
    expect(result.system).toBeNull()
    expect(result.project).toBeNull()
    expect(result.tail).toBeNull()
    expect(result.blocks).toEqual([])
  })
})

describe('@owlmeans/llm — prompt regions', () => {
  const full = () => compose(
    service([skill('a', 'A'), skill('percall', 'P')], [
      { alias: 'pkg', inspect: ctx => ctx.add(PromptBlock.Packages, 'package text') },
    ]),
    { role: 'R', skills: ['a'], callSkills: ['percall'], context: ['caller system'] },
  )

  // The system is stable for a persona (and its packages), the project message for a step, the
  // tail for one call — each region travels where its stability allows it to be cached.
  test('the system holds the persona, the project message the facts, the tail the call', async () => {
    const result = await full()
    expect(result.system).toBe('R\n\n## a\n\nA\n\npackage text')
    expect(result.project).toBe(`${PROJECT_CONTEXT_HEADER}\n\ncaller system`)
    expect(result.tail).toBe('## percall\n\nP')
    expect(result.blocks.map(block => [block.block, block.region])).toEqual([
      [PromptBlock.Role, PromptRegion.System], [PromptBlock.Skills, PromptRegion.System],
      [PromptBlock.Packages, PromptRegion.System], [PromptBlock.Context, PromptRegion.Project],
      [PromptBlock.Tail, PromptRegion.Tail],
    ])
  })

  // A caller that adopted no persona keeps sending what it built: its own system text stays the
  // system message, and there is no project message.
  test('with nothing for the system region, the project facts stay in the system message', async () => {
    const result = await compose(service(), { context: ['legacy system message'] })
    expect(result.system).toBe('legacy system message')
    expect(result.project).toBeNull()
    expect(result.blocks.map(block => block.region)).toEqual([PromptRegion.System])
  })

  test('the operator header opens the project message only when there are facts', async () => {
    const result = await compose(service([skill('a', 'A')]), { role: 'R', skills: ['a'] })
    expect(result.project).toBeNull()
    expect(result.system).not.toContain(PROJECT_CONTEXT_HEADER)
  })
})

describe('@owlmeans/llm — composed prompt cache policy', () => {
  test('caching is on by default, at five minutes everywhere', async () => {
    const result = await compose(service([skill('a', 'A')]), { role: 'R', skills: ['a'] })
    expect(result.cache).toEqual({ enabled: true, ttl: { skills: '5m', packages: '5m', project: '5m', stable: '5m' } })
  })

  test('opting out is carried to the provider, and the regions stay plain text', async () => {
    const result = await compose(service([skill('a', 'A')]), { role: 'R', skills: ['a'], cacheSystem: false })
    expect(result.cache.enabled).toBe(false)
    expect(result.system).toBe('R\n\n## a\n\nA')
  })

  // The service default sits under the policy key by key; a string names every key at once.
  test('lifetimes resolve service default, then policy, key by key', async () => {
    const svc = makePromptService({ cacheTtl: { skills: '1h' } }, `spec-prompt-${seq++}`)
    const result = await compose(svc, { role: 'R', cacheTtl: { packages: '1h' } })
    expect(result.cache.ttl).toEqual({ skills: '1h', packages: '1h', project: '5m', stable: '5m' })

    const all = await compose(svc, { role: 'R', cacheTtl: '1h' })
    expect(all.cache.ttl).toEqual({ skills: '1h', packages: '1h', project: '1h', stable: '1h' })
  })

  // A provider refuses a longer-lived entry after a shorter-lived one.
  test('a lifetime never rises along the prefix', async () => {
    const result = await compose(service(), { role: 'R', cacheTtl: { skills: '5m', project: '1h', stable: '1h' } })
    expect(result.cache.ttl).toEqual({ skills: '5m', packages: '5m', project: '5m', stable: '5m' })
  })
})
