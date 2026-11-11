import type { TokenBudgetStatus } from './consts.js'
import type { TokenBudgetPart } from './types.js'

/** One part while it is being fitted. */
export interface FittingPart {
  part: TokenBudgetPart
  index: number
  original: number
  status: TokenBudgetStatus
  text: string
  tokens: number
}

/** A part's head with its marker, as it would be placed. */
export interface TrimmedText {
  text: string
  tokens: number
}
