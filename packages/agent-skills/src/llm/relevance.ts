import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ProjectSkill } from './skill-file.js'

/** Flatten a LangChain message content field to plain text. */
export const contentText = (content: unknown): string => {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        const text = (part as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      })
      .join('\n')
  }

  return ''
}

/** What a rule may look at. Every predicate that is present must hold. */
export interface SkillActivationWhen {
  /** `LlmPurpose.type` of the calling execution — `'coder'`, `'analyst'`, … */
  purposeType?: string[]
  /** Tested against the call's `action` (the LangChain run name). */
  action?: RegExp
  /** Case-insensitive substrings of the conversation text. */
  mention?: string[]
  /** Path fragments or `*` globs matched against path-shaped tokens in the text. */
  paths?: string[]
}

/**
 * A host's own "this call is about that skill" rule.
 *
 * Deterministic by construction, which is why it is the default and the model pick is
 * not: the same request activates the same skills on every retry, so the prompt those
 * retries send is byte-identical and can still hit the provider's cache.
 */
export interface SkillActivationRule {
  skills: string[]
  when: SkillActivationWhen
}

/** Everything the activation decision is allowed to look at. */
export interface SkillSignals {
  purposeType?: string
  action?: string
  /** The call's conversation, flattened. */
  text: string
  /** Names of the installed skills this call may choose from. */
  names: readonly string[]
}

/** Tokens in the text that look like paths — `src/llm/plugin.ts`, `.agents/skills/`. */
const PATH_TOKEN = /[A-Za-z0-9_@.-]*\/[A-Za-z0-9_@./-]+/g

const globToRegExp = (glob: string): RegExp => {
  const source = glob
    .split('**').map(part => part.split('*')
      .map(chunk => chunk.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*'))
    .join('.*')

  return new RegExp(`(?:^|/)${source}$`)
}

const matchesPath = (pattern: string, tokens: readonly string[]): boolean =>
  pattern.includes('*')
    ? tokens.some(token => globToRegExp(pattern).test(token))
    : tokens.some(token => token.includes(pattern))

/**
 * Which rules fire for this call.
 *
 * A rule with no predicate at all never fires — an empty `when` reads as "always", and a
 * rule that activates a skill on every request is the static `Skills` block written in
 * the wrong place, where it costs a body instead of an index line.
 */
export const matchRules = (
  rules: readonly SkillActivationRule[],
  signals: SkillSignals,
): string[] => {
  const haystack = signals.text.toLowerCase()
  const tokens = [...signals.text.matchAll(PATH_TOKEN)].map(match => match[0])
  const known = new Set(signals.names)
  const picked: string[] = []

  for (const rule of rules) {
    const { purposeType, action, mention, paths } = rule.when
    if (purposeType == null && action == null && mention == null && paths == null) {
      continue
    }
    if (purposeType != null && !purposeType.includes(signals.purposeType ?? '')) {
      continue
    }
    if (action != null) {
      // A `g`/`y` regex carries `lastIndex` between tests; without the reset the same
      // rule would fire on some calls and not others for no reason the caller can see.
      action.lastIndex = 0
      if (!action.test(signals.action ?? '')) {
        continue
      }
    }
    if (mention != null && !mention.some(term => haystack.includes(term.toLowerCase()))) {
      continue
    }
    if (paths != null && !paths.some(pattern => matchesPath(pattern, tokens))) {
      continue
    }
    for (const name of rule.skills) {
      if (known.has(name) && !picked.includes(name)) {
        picked.push(name)
      }
    }
  }

  return picked
}

/** How much of the conversation the cheap model is shown when it picks. */
const MAX_PICK_CHARS = 4000

const NAMES = /\[[^\]]*\]/

/**
 * Ask a cheap model which of the indexed skills this request is actually about.
 *
 * One call, one line back, names only — the model is choosing from a list it was given,
 * never writing guidance. Anything it cannot be held to (a name that is not in the index,
 * a refusal, an outage) collapses to "no skill", because a prompt missing one skill is a
 * worse answer while a prompt that failed to compose is no answer at all.
 *
 * The result must never reach `Role` or `Skills`: a model's answer is not reproducible
 * byte-for-byte, and a cached block that shifts is a cache that never reads.
 */
export const pickByModel = async (
  index: readonly ProjectSkill[],
  signals: SkillSignals,
  model: BaseChatModel | undefined,
  max: number,
): Promise<string[]> => {
  if (model == null || index.length === 0 || max <= 0) {
    return []
  }
  const known = new Set(index.map(skill => skill.name))
  const prompt = [
    `Pick at most ${max} skills whose guidance the request below needs.`,
    'Answer with a JSON array of names copied verbatim from the list, or [] when none apply.',
    'No prose, no explanation.',
    '',
    'Skills:',
    ...index.map(skill => `- ${skill.name}: ${skill.description}`),
    '',
    'Request:',
    signals.text.slice(0, MAX_PICK_CHARS),
  ].join('\n')

  try {
    const answer = await model.invoke([{ role: 'user', content: prompt }])
    const found = NAMES.exec(contentText(answer.content))
    if (found == null) {
      return []
    }
    const parsed: unknown = JSON.parse(found[0])

    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((name): name is string => typeof name === 'string'))]
        .filter(name => known.has(name))
        .slice(0, max)
      : []
  } catch {
    return []
  }
}
