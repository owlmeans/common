import Ajv from 'ajv'
import type { HelperExecution } from '@owlmeans/llm'
import { textUtils } from '../utils/text.js'
import type { PageModel } from '../models/page/types.js'
import { EVIDENCE_SCHEMA } from './schemas.js'
import type { DomAnswer, DomTask, Evidence } from './types.js'

/** What the agent is told it is doing — run context, never the shared system region. */
const BRIEF = [
  'You are reading a web page through its DOM to answer one task.',
  'Nodes are addressed by refs (n12). Start from dom_outline, narrow down with dom_query (a CSS selector) or dom_find (text),',
  'open nodes with dom_expand and read them with dom_text. Prefer machine-readable markup — <time datetime>, rel=author,',
  'itemprop, meta tags, JSON-LD in <script> — over prose. When you know the answer, call submit with the result and the',
  'evidence: the refs you read it from and a short exact quote of their text. Never guess a value the page does not show;',
  'leave it empty instead.',
].join(' ')

const STRING = { type: 'string' } as const

/**
 * Explore a page's DOM with an `@owlmeans/agent` tool loop and submit an answer that validates
 * against the task schema. Imported lazily by the analyst: the agent and its LangGraph peers load
 * only when DOM mode runs.
 */
export const runDomAgent = async (
  helper: HelperExecution,
  page: PageModel,
  task: DomTask,
  maxTurns: number,
): Promise<DomAnswer> => {
  const [{ makeAgentModel }, { tool }] = await Promise.all([import('@owlmeans/agent'), import('@langchain/core/tools')])
  const dom = page.dom()
  const ajv = new Ajv({ strict: false, allErrors: true })
  const validate = ajv.compile(task.schema)
  const answer: DomAnswer = { evidence: [], notes: '' }

  const verified = (evidence: Evidence[]): Evidence[] => evidence.flatMap(item => {
    const text = dom.text(item.ref, 100_000)
    const quote = textUtils.collapse(item.quote)
    if (text == null || quote.length === 0 || !text.toLowerCase().includes(quote.toLowerCase())) return []
    const selector = dom.selector(item.ref)
    return [{ ref: item.ref, quote, ...(selector != null ? { selector } : {}) }]
  })

  const json = (value: unknown): string => JSON.stringify(value)

  const tools = {
    dom_outline: tool(
      async ({ ref, depth }: { ref?: string, depth?: number }) => dom.outline(ref, Math.min(depth ?? 3, 6), 8000),
      {
        name: 'dom_outline',
        verboseParsingErrors: true,
        description: 'The element skeleton (refs, tags, key attributes, own text) from a ref — the body when omitted.',
        schema: { type: 'object', properties: { ref: STRING, depth: { type: 'number' } }, additionalProperties: false },
      },
    ),
    dom_query: tool(
      async ({ selector }: { selector: string }) => {
        try {
          const found = dom.query(selector, 20)
          return found.length > 0 ? json(found) : `no element matches ${selector}`
        } catch (e) {
          return `invalid selector ${selector}: ${(e as Error).message}`
        }
      },
      {
        name: 'dom_query',
        verboseParsingErrors: true,
        description: 'Elements matching a CSS selector (at most 20), with ref, tag, attributes and text.',
        schema: { type: 'object', properties: { selector: STRING }, required: ['selector'], additionalProperties: false },
      },
    ),
    dom_find: tool(
      async ({ text }: { text: string }) => {
        const found = dom.find(text, 20)
        return found.length > 0 ? json(found) : `no element's own text contains "${text}"`
      },
      {
        name: 'dom_find',
        verboseParsingErrors: true,
        description: 'Elements whose own text contains the given text, case-insensitive.',
        schema: { type: 'object', properties: { text: STRING }, required: ['text'], additionalProperties: false },
      },
    ),
    dom_expand: tool(
      async ({ refs }: { refs: string[] }) => refs.slice(0, 8).map(ref => dom.outline(ref, 2, 3000) || `no node ${ref}`).join('\n\n'),
      {
        name: 'dom_expand',
        verboseParsingErrors: true,
        description: 'The skeleton under each ref, two levels deep — open several nodes at once.',
        schema: { type: 'object', properties: { refs: { type: 'array', items: STRING } }, required: ['refs'], additionalProperties: false },
      },
    ),
    dom_text: tool(
      async ({ ref }: { ref: string }) => dom.text(ref, 4000) ?? `no node ${ref}`,
      {
        name: 'dom_text',
        verboseParsingErrors: true,
        description: 'The full readable text of a node.',
        schema: { type: 'object', properties: { ref: STRING }, required: ['ref'], additionalProperties: false },
      },
    ),
    submit: tool(
      async ({ result, evidence }: { result: unknown, evidence?: Evidence[] }) => {
        if (!validate(result)) {
          return `Rejected — the result does not match the schema: ${ajv.errorsText(validate.errors)}. Fix it and submit again.`
        }
        const incomplete = task.check?.(result)
        if (incomplete != null) {
          return `Rejected — ${incomplete} Fix it and submit again.`
        }
        answer.submitted = result
        answer.evidence = verified(evidence ?? [])
        return 'Accepted. Reply with the single word: done.'
      },
      {
        name: 'submit',
        description: 'Submit the final answer with its evidence. Call it when the answer is complete; a rejected submission says what to fix.',
        // The schema the model is shown; a mismatch comes back with its details, so it can be corrected.
        verboseParsingErrors: true,
        schema: {
          type: 'object',
          properties: { result: task.schema, evidence: EVIDENCE_SCHEMA },
          required: ['result'],
          additionalProperties: false,
        },
      },
    ),
  }

  const meta = page.meta()
  const agent = makeAgentModel({
    exec: helper,
    tools,
    maxTurns,
    entrypoint: 'llm-reader-dom',
    context: [BRIEF, `Page: ${page.url}${meta.title != null ? ` — "${meta.title.value}"` : ''}`, ...task.context],
  })
  const result = await agent.invoke(`Task: ${task.instruction}`, { action: task.action })
  const last = result.message.content
  answer.notes = typeof last === 'string' ? last : textUtils.collapse(JSON.stringify(last))

  return answer
}
