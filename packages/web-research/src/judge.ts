import { logger } from '@owlmeans/log'
import { RESEARCH_LIMITS, ResearchRole } from './consts.js'
import { JUDGE_INSTRUCTION } from './judge/consts.js'
import { InjectionAnswerSchema } from './judge/schemas.js'
import type { ResearchJudgeOptions } from './judge/types.js'
import type { ResearchModels } from './models/types.js'
import { SIGNALS_SHOWN } from './screen/consts.js'
import type { ResearchScreen } from './screen/types.js'
import { textUtils } from './utils/text.js'

const log = logger('web-research:judge')

/**
 * The shipped judge: ONE structured call at `ResearchRole.Judge` per flagged source. An injection
 * counts only with a sentence the source really holds (compared whitespace-insensitively) — an order
 * the page does not carry is the model's, not the page's.
 */
export const makeResearchJudge = (models: ResearchModels, options: ResearchJudgeOptions = {}): ResearchScreen => {
  const maxChars = options.maxChars ?? RESEARCH_LIMITS.judgeChars

  const judge: ResearchScreen['judge'] = async (text, signals, context) => {
    const content = [
      `# What an automatic scan flagged in it`,
      signals.slice(0, SIGNALS_SHOWN).map(signal => `- ${signal.kind}: ${signal.excerpt}`).join('\n'),
      `# The page: ${context.url}${context.title != null ? ` — ${context.title}` : ''}`,
      `Read for: ${textUtils.line(context.purpose, 300)}`,
      "'''",
      textUtils.cap(text, maxChars),
      "'''",
    ].join('\n\n')

    const answer = await models.json(ResearchRole.Judge, { instruction: JUDGE_INSTRUCTION, content }, InjectionAnswerSchema, {
      action: 'research-screen-injection',
    })
    if (answer.injection !== true) return { injected: false, reason: answer.reason }
    const quote = answer.quote.trim()
    if (quote === '' || !textUtils.squash(text).includes(textUtils.squash(quote))) {
      log.warn('Injection verdict without a verbatim quote; source kept', { url: context.url })
      return { injected: false, reason: answer.reason }
    }
    return { injected: true, reason: answer.reason, quote }
  }

  return { judge }
}
