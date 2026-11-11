import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { TokenBudgetStatus, tokenBudgetHelper } from '../src/tokens/index.js'
import type { TokenBudgetPart } from '../src/tokens/index.js'

const { count, estimate, within, fit } = tokenBudgetHelper

const paragraph = (topic: string, sentences: number): string =>
  Array.from({ length: sentences }, (_, i) => `The ${topic} requirement number ${i + 1} describes what the application must do for its users.`).join(' ')

const spec = (topic: string, paragraphs: number): string =>
  Array.from({ length: paragraphs }, (_, i) => `## ${topic} ${i + 1}\n\n${paragraph(topic, 6)}`).join('\n\n')

const samples = {
  prose: readFileSync(new URL('../README.md', import.meta.url), 'utf8'),
  code: readFileSync(new URL('../src/model.ts', import.meta.url), 'utf8'),
  cyrillic: 'Приложение управляет пользователями, ролями и правами доступа. Каждое изменение проверяется. '.repeat(40),
  cjk: '应用程序管理用户、角色和访问权限。每次更改都会经过审核。'.repeat(40),
}

describe('@owlmeans/llm — token counts', () => {
  test('count is the o200k tokenizer; a special-token string is counted as text, never thrown on', () => {
    expect(count('')).toBe(0)
    expect(count('Hello world')).toBe(2)
    expect(count('Before <|endoftext|> after')).toBeGreaterThan(3)
    expect(within('Hello world', 2)).toBe(true)
    expect(within('Hello world', 1)).toBe(false)
    expect(within(samples.code, 10)).toBe(false)
  })

  test('estimate stays within a fifth of the count on prose, code, Cyrillic and CJK', () => {
    for (const [name, text] of Object.entries(samples)) {
      const ratio = estimate(text) / count(text)
      expect([name, ratio > 0.8 && ratio < 1.25]).toEqual([name, true])
    }
  })
})

describe('@owlmeans/llm — fitting parts into a budget', () => {
  const prompt: TokenBudgetPart = { id: 'prompt', text: 'Build a booking app for a small clinic.', priority: 10 }
  const brief: TokenBudgetPart = { id: 'brief.md', text: spec('Booking', 12), priority: 5 }
  const notes: TokenBudgetPart = { id: 'notes.txt', text: spec('Notes', 8), priority: 1 }

  test('everything fits: every part verbatim, joined in input order', () => {
    const result = fit([prompt, brief, notes], 100_000)

    expect(result.kept).toEqual(['prompt', 'brief.md', 'notes.txt'])
    expect(result.text).toBe([prompt.text, brief.text, notes.text].join('\n\n'))
    expect(result.tokens).toBe(count(result.text))
    expect(result.parts.map(part => part.tokens)).toEqual([count(prompt.text), count(brief.text), count(notes.text)])
  })

  test('the highest priority stays verbatim, the next is cut at a boundary with a marker, the last is dropped', () => {
    const budget = count(prompt.text) + Math.floor(count(brief.text) / 2)
    const result = fit([notes, brief, prompt], budget)

    expect(result.kept).toEqual(['prompt'])
    expect(result.trimmed).toEqual(['brief.md'])
    expect(result.dropped).toEqual(['notes.txt'])
    expect(result.tokens).toBeLessThanOrEqual(budget)
    const trimmed = result.parts.find(part => part.id === 'brief.md')!
    expect(trimmed.status).toBe(TokenBudgetStatus.Trimmed)
    expect(trimmed.original).toBe(count(brief.text))
    const [head, marker] = trimmed.text.split('\n\n[… ')
    expect(brief.text.startsWith(head!)).toBe(true)
    expect(head!.endsWith('users.')).toBe(true)
    // Whole paragraphs, then whole sentences of the next one: the cut is always at a boundary.
    expect(brief.text.slice(head!.length)).toMatch(/^\s+(## Booking|The Booking)/)
    expect(marker).toBe(`${trimmed.original - count(head!)} tokens of "brief.md" omitted …]`)
    // Input order is kept in the text: the trimmed brief comes before the prompt.
    expect(result.text.indexOf('## Booking 1')).toBeLessThan(result.text.indexOf(prompt.text))
  })

  test('a paragraph too long to keep whole is cut at a sentence; a part with no whole sentence room is dropped', () => {
    const long: TokenBudgetPart = { id: 'long', text: paragraph('Search', 40), priority: 1 }
    const result = fit([long], 120)
    const head = result.parts[0]!.text.split('\n\n[… ')[0]!

    expect(result.trimmed).toEqual(['long'])
    expect(head.endsWith('users.')).toBe(true)
    expect(result.tokens).toBeLessThanOrEqual(120)
    expect(fit([long], 12).dropped).toEqual(['long'])
  })

  test('minTokens drops a part rather than keep a sliver of it', () => {
    const budget = count(prompt.text) + 60
    expect(fit([prompt, brief], budget).trimmed).toEqual(['brief.md'])
    expect(fit([prompt, { ...brief, minTokens: 500 }], budget).dropped).toEqual(['brief.md'])
  })

  test('parts of one priority share what is left; a small one stays whole', () => {
    const small: TokenBudgetPart = { id: 'small', text: 'Use the clinic colours.', priority: 3 }
    const a: TokenBudgetPart = { id: 'a', text: spec('Alpha', 10), priority: 3 }
    const b: TokenBudgetPart = { id: 'b', text: spec('Beta', 10), priority: 3 }
    const result = fit([a, small, b], 600)

    expect(result.kept).toEqual(['small'])
    expect(result.trimmed).toEqual(['a', 'b'])
    const [ta, tb] = [result.parts[0]!.tokens, result.parts[2]!.tokens]
    expect(Math.abs(ta - tb)).toBeLessThan(80)
    expect(result.tokens).toBeLessThanOrEqual(600)
  })

  test('deterministic, and never over the budget at any size', () => {
    const parts = [notes, brief, prompt]
    expect(fit(parts, 777)).toEqual(fit(parts, 777))
    for (const budget of [0, 5, 40, 150, 333, 900, 2500]) {
      const result = fit(parts, budget)
      expect(result.tokens).toBeLessThanOrEqual(budget)
      expect(result.tokens).toBe(count(result.text))
    }
  })

  test('a custom separator and marker are counted against the budget', () => {
    const result = fit([prompt, brief], 200, { separator: '\n---\n', marker: ({ omitted }) => `\n(${omitted} more)` })

    expect(result.text).toContain('\n---\n')
    expect(result.text).toMatch(/\n\(\d+ more\)$/)
    expect(result.tokens).toBeLessThanOrEqual(200)
  })
})
