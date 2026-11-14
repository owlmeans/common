import type { SkillSection } from './types.js'

/** The sections every generated SKILL.md carries, in the order the writer is asked for them. */
export const SKILL_SECTIONS: readonly SkillSection[] = Object.freeze([
  { title: 'When to use', match: /^when (to|should you) use/i },
  { title: 'Install', match: /^install/i },
  { title: 'Imports', match: /^import/i },
  { title: 'Core API', match: /^(core )?api\b/i },
  { title: 'Recipes', match: /^(recipes?|examples?|usage)\b/i },
  { title: 'Pitfalls', match: /^(pitfalls?|gotchas|common mistakes)\b/i },
  { title: 'Version notes', match: /^version/i },
])
