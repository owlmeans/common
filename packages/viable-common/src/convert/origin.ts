import { CONVERTED_ORIGIN_DIR, ORIGIN_CARD_MAX_CHARS } from './consts.js'
import type { ArchitectureCase } from './consts.js'
import type { ConversionOriginHelper, OriginCard } from './origin/types.js'

export const createConversionOriginHelper = (): ConversionOriginHelper => {
  const originCardChars = (card: OriginCard): number => [
    card.stack as string,
    card.case as ArchitectureCase as string,
    card.purpose,
    ...card.packages,
    ...card.entities,
    ...card.flows,
    ...card.conventions,
  ].reduce((total, part) => total + (part?.length ?? 0), 0)

  const originCardFits = (card: OriginCard): boolean =>
    originCardChars(card) <= ORIGIN_CARD_MAX_CHARS

  const isOriginPath = (path: string): boolean =>
    path === CONVERTED_ORIGIN_DIR || path.startsWith(`${CONVERTED_ORIGIN_DIR}/`)

  const originPath = (relative: string): string => {
    const path = relative.replace(/^\/+/, '')
    if (path === '') return CONVERTED_ORIGIN_DIR
    if (isOriginPath(path)) return path

    return `${CONVERTED_ORIGIN_DIR}/${path}`
  }

  return { originCardChars, originCardFits, isOriginPath, originPath }
}

export const conversionOriginHelper = createConversionOriginHelper()
