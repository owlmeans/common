import { InquiryKind, type InquiryOption } from '@owlmeans/llm-common'

export interface AskUserArgs {
  question: string
  kind: InquiryKind
  context?: string
  options?: InquiryOption[]
  multiple?: boolean
  allowText?: boolean
  default?: string
}
