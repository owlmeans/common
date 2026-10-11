import { describe, expect, test } from 'bun:test'
import {
  CUMULATIVE_RESULTS_OMITTED_LEAD, CUMULATIVE_RESULTS_PREAMBLE, PROMPT_BLOCK_ORDER, PromptBlock,
  renderCumulativeResults,
} from '../src/index.js'
import type { CumulativeResults } from '../src/index.js'

/**
 * The prompt-facing half of cumulative pipeline results: where the block sits and what it says.
 * Both are cache facts as much as wording — a view must render to the same bytes every time, and
 * an absent view must render to nothing at all.
 */

const view = (patch: Partial<CumulativeResults> = {}): CumulativeResults => ({
  step: 'resources',
  sections: [
    { step: 'types', text: '### types\n- type `User`: { id: string } — import from `@app/common`' },
    { step: 'files', text: '### files (names only)\n- file: `a.ts`' },
  ],
  omitted: [],
  chars: 100,
  digest: 'digest-that-must-never-be-rendered',
  ...patch,
})

describe('@owlmeans/llm-common — results block placement', () => {
  test('sits after the packages block and before the per-call context', () => {
    expect(PROMPT_BLOCK_ORDER).toEqual([
      PromptBlock.Role, PromptBlock.Skills, PromptBlock.Packages, PromptBlock.Results,
      PromptBlock.Context,
    ])
  })
})

describe('@owlmeans/llm-common — rendering a results view', () => {
  test('no view, or a view with nothing in it, renders nothing at all', () => {
    expect(renderCumulativeResults(undefined)).toBe('')
    expect(renderCumulativeResults(null)).toBe('')
    expect(renderCumulativeResults(view({ sections: [] }))).toBe('')
  })

  test('opens with the fixed rules, then the sections oldest first', () => {
    const text = renderCumulativeResults(view())

    expect(text.startsWith(CUMULATIVE_RESULTS_PREAMBLE)).toBe(true)
    expect(text).toContain('No model wrote it.')
    expect(text).toContain('Import a listed symbol only from the specifier listed for it.')
    expect(text).toContain('is NEWER than this list')
    expect(text.indexOf('### types')).toBeLessThan(text.indexOf('### files'))
  })

  test('never renders the digest, and renders the same bytes every time', () => {
    const text = renderCumulativeResults(view())

    expect(text).not.toContain('digest-that-must-never-be-rendered')
    expect(renderCumulativeResults(view())).toBe(text)
  })

  test('names the steps left out for space, and says their results exist', () => {
    const text = renderCumulativeResults(view({ omitted: ['scaffold', 'design/screens'] }))

    expect(text).toContain(`${CUMULATIVE_RESULTS_OMITTED_LEAD} \`scaffold\`, \`design/screens\`.`)
    expect(text.endsWith('Look there before creating anything they may already have made.')).toBe(true)
  })
})
