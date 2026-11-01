import { TITLE_MAX } from '@owlmeans/planning'
import { LANDING_STORY_SENTENCE } from './consts.js'
import type { LandingSentenceHelper } from './landing/types.js'

export const createLandingSentenceHelper = (): LandingSentenceHelper => {
  const normalized = (text: string): string => text.replace(/\s+/g, ' ')

  const hasLandingSentence = (title: string, sentence?: string): boolean => {
    const text = normalized(title)

    return text.includes(LANDING_STORY_SENTENCE)
      || (sentence != null && sentence.trim() !== '' && text.includes(normalized(sentence.trim())))
  }

  const withLandingSentence = (title: string, sentence: string = LANDING_STORY_SENTENCE): string => {
    if (hasLandingSentence(title, sentence)) {
      return title
    }
    const said = sentence.trim() !== '' ? sentence.trim() : LANDING_STORY_SENTENCE
    const base = title.trimEnd()
    if (base === '') {
      return said
    }
    const joined = `${base} ${said}`

    return joined.length > TITLE_MAX ? title : joined
  }

  return { hasLandingSentence, withLandingSentence }
}

export const landingSentenceHelper = createLandingSentenceHelper()

/** @deprecated compat:factory-refactor — use `landingSentenceHelper.hasLandingSentence(…)` */
export const hasLandingSentence = (title: string): boolean => landingSentenceHelper.hasLandingSentence(title)

/** @deprecated compat:factory-refactor — use `landingSentenceHelper.withLandingSentence(…)` */
export const withLandingSentence = (title: string): string => landingSentenceHelper.withLandingSentence(title)
