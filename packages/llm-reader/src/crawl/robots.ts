import type { RobotsHelper, RobotsRule, RobotsRules } from './types.local.js'

/** A robots.txt path pattern: `*` any run of characters, a trailing `$` the end of the path. */
const matcherOf = (pattern: string): RegExp => {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern).split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`)
}

/** Percent-encoding normalized the same way on both sides of a comparison. */
const canonical = (path: string): string => {
  try {
    return encodeURI(decodeURI(path))
  } catch {
    return path
  }
}

const rulesOf = (rules: RobotsRule[], delay?: number): RobotsRules => ({
  allows: path => {
    const target = canonical(path === '' ? '/' : path)
    let best: RobotsRule | undefined
    for (const rule of rules) {
      if (!rule.matcher.test(target)) continue
      if (best == null || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule
    }
    return best?.allow ?? true
  },
  ...(delay != null ? { delay } : {}),
})

export const createRobotsHelper = (): RobotsHelper => {
  const allowAll = rulesOf([])
  const disallowAll = rulesOf([{ allow: false, pattern: '/', matcher: /^\// }])

  const parse: RobotsHelper['parse'] = (text, userAgent) => {
    const token = userAgent.toLowerCase()
    const groups: Array<{ agents: string[], rules: RobotsRule[], delay?: number }> = []
    let current: { agents: string[], rules: RobotsRule[], delay?: number } | undefined
    let collectingAgents = false
    for (const raw of text.split(/\r\n|\r|\n/)) {
      const line = raw.replace(/#.*$/, '').trim()
      const at = line.indexOf(':')
      if (at < 0) continue
      const field = line.slice(0, at).trim().toLowerCase()
      const value = line.slice(at + 1).trim()
      if (field === 'user-agent') {
        if (current == null || !collectingAgents) {
          current = { agents: [], rules: [] }
          groups.push(current)
        }
        current.agents.push(value.toLowerCase())
        collectingAgents = true
        continue
      }
      collectingAgents = false
      if (current == null) continue
      if (field === 'allow' || field === 'disallow') {
        // An empty Disallow allows everything; it adds no rule.
        if (value === '') continue
        const pattern = canonical(value.startsWith('/') || value.startsWith('*') ? value : `/${value}`)
        current.rules.push({ allow: field === 'allow', pattern, matcher: matcherOf(pattern) })
      } else if (field === 'crawl-delay') {
        const delay = Number(value)
        if (Number.isFinite(delay) && delay >= 0) current.delay = delay
      }
    }
    // The longest user-agent value our token contains wins; `*` only when none does.
    let chosen: Array<{ rules: RobotsRule[], delay?: number }> = []
    let best = -1
    for (const group of groups) {
      for (const agent of group.agents) {
        const length = agent === '*' ? 0 : token.includes(agent) ? agent.length : -1
        if (length > best) {
          best = length
          chosen = [group]
        } else if (length === best && length >= 0 && !chosen.includes(group)) {
          chosen.push(group)
        }
      }
    }
    if (best < 0) return allowAll
    const delays = chosen.map(group => group.delay).filter((delay): delay is number => delay != null)
    return rulesOf(chosen.flatMap(group => group.rules), delays.length > 0 ? Math.max(...delays) : undefined)
  }

  return { parse, allowAll, disallowAll }
}

export const robotsHelper = createRobotsHelper()
