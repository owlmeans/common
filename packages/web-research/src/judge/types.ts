/** What the judge model answers. */
export interface InjectionAnswer {
  injection: boolean
  quote: string
  reason: string
}

export interface ResearchJudgeOptions {
  /** Characters of the source the judge reads; `RESEARCH_LIMITS.judgeChars` by default. */
  maxChars?: number
}
