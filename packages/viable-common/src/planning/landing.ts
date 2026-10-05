import { TITLE_MAX } from '@owlmeans/planning'
import { LANDING_STORY_SENTENCE } from './consts.js'
import type { LandingSentenceHelper } from './landing/types.js'

export const createLandingSentenceHelper = (): LandingSentenceHelper => {
  const normalized = (text: string): string => text.replace(/\s+/g, ' ')

  const hasLandingSentence = (title: string): boolean =>
    normalized(title).includes(LANDING_STORY_SENTENCE)

  const withLandingSentence = (title: string): string => {
    if (hasLandingSentence(title)) {
      return title
    }
    const base = title.trimEnd()
    if (base === '') {
      return LANDING_STORY_SENTENCE
    }
    const joined = `${base} ${LANDING_STORY_SENTENCE}`

    return joined.length > TITLE_MAX ? title : joined
  }

  return { hasLandingSentence, withLandingSentence }
}

export const landingSentenceHelper = createLandingSentenceHelper()

/** @deprecated compat:factory-refactor — use `landingSentenceHelper.hasLandingSentence(…)` */
export const hasLandingSentence = (title: string): boolean => landingSentenceHelper.hasLandingSentence(title)

/** @deprecated compat:factory-refactor — use `landingSentenceHelper.withLandingSentence(…)` */
export const withLandingSentence = (title: string): string => landingSentenceHelper.withLandingSentence(title)
