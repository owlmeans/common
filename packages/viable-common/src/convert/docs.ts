import { CONVERSION_SEED_DATA_DIR, CONVERSION_SEED_DIR, CONVERSION_STORY_DIR } from './consts.js'
import type { ConversionDocHelper } from './docs/types.js'

export const createConversionDocHelper = (): ConversionDocHelper => {
  const conversionStoryDoc = (code: string): string => `${CONVERSION_STORY_DIR}/${code}.md`

  const conversionSeedDoc = (name: string): string => `${CONVERSION_SEED_DIR}/${name}.md`

  const conversionSeedData = (name: string, ext: string): string =>
    `${CONVERSION_SEED_DATA_DIR}/${name}.${ext}`

  return { conversionStoryDoc, conversionSeedDoc, conversionSeedData }
}

export const conversionDocHelper = createConversionDocHelper()
