import { CONVERSION_SEED_DATA_DIR, CONVERSION_SEED_DIR, CONVERSION_WORKCARD_DIR, CONVERSION_SUMMARY_DIR } from './consts.js'
import type { ConversionDocHelper } from './docs/types.js'

export const createConversionDocHelper = (): ConversionDocHelper => {
  const conversionWorkcardDoc = (code: string): string => `${CONVERSION_WORKCARD_DIR}/${code}.md`

  const conversionSeedDoc = (name: string): string => `${CONVERSION_SEED_DIR}/${name}.md`

  const conversionSeedData = (name: string, ext: string): string =>
    `${CONVERSION_SEED_DATA_DIR}/${name}.${ext}`

  const conversionSummaryDoc = (name: string): string => `${CONVERSION_SUMMARY_DIR}/${name}.md`

  return { conversionWorkcardDoc, conversionSeedDoc, conversionSeedData, conversionSummaryDoc }
}

export const conversionDocHelper = createConversionDocHelper()
