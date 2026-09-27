import { tool } from '@langchain/core/tools'
import { IdStyle, createIdOfLength } from '@owlmeans/basic-ids'
import { DEFAULT_INQUIRY_OPTIONS, InquiryKind, capAnswer } from '@owlmeans/llm-common'
import type { Inquiry, InquiryAnswer, InquiryOption } from '@owlmeans/llm-common'
import { InquiryDeclined, InquiryUnavailable } from '@owlmeans/llm'
import { toErrorResponse } from '../helpers/tools.js'
import type { AgentPlugin, AgentRun, AgentToolSet } from '../types.js'

export const INQUIRY_PLUGIN = 'agent-inquiry'
export const ASK_USER_TOOL = 'ask_user'

export interface InquiryPluginOptions {
  /**
   * How a question reaches a person.
   *
   * `null` answers "nobody is there", which the tool reports to the model as something it must
   * decide itself. Absent means there is no channel at all, and then the tool is not offered:
   * a tool nobody can serve is one the model tries once and remembers as broken.
   */
  ask?: (inquiry: Inquiry, run: AgentRun) => Promise<InquiryAnswer | null>
  /** How question ids are minted. They are what routes an answer back. */
  idOf?: () => string
  name?: string
  /** Whether the Context block explains when the tool may be used. Default `true`. */
  instruct?: boolean
  maxOptions?: number
  maxAnswerChars?: number
}

interface AskUserArgs {
  question: string
  kind: InquiryKind
  context?: string
  options?: InquiryOption[]
  multiple?: boolean
  allowText?: boolean
  default?: string
}

/**
 * `ask_user` — one short question to the person driving the run.
 *
 * The tool NEVER throws, with exactly one exception, and the distinction is the whole contract:
 * no channel is an answerable situation (decide, record the assumption, carry on), while a channel
 * that WAS there and has gone is terminal. So `InquiryUnavailable` is rethrown, and an agent that
 * installs this plugin must pass `fatal: e => isFatalError(e) != null` to `makeAgentModel` —
 * `safeInvokeTool` contains everything else by default, and without that predicate a dead channel
 * comes back as a readable tool error the model spends its whole turn budget arguing with.
 *
 * An application that prefers the softer reading wires `options.ask` through `executionInquiry`,
 * which maps `InquiryUnavailable` to `null` for it.
 */
export const inquiryPlugin = (options: InquiryPluginOptions = {}): AgentPlugin => {
  const {
    ask, name = ASK_USER_TOOL, instruct = true, maxOptions = DEFAULT_INQUIRY_OPTIONS,
  } = options
  const idOf = options.idOf ?? (() => createIdOfLength(12, IdStyle.Base58))

  return {
    alias: INQUIRY_PLUGIN,
    order: 45,

    context: async () => ask == null || !instruct ? [] : [
      '# Asking the person\n\n'
      + `You may put ONE short question to the person driving this run with the \`${name}\` tool, `
      + 'and only when the work genuinely cannot continue without a decision that is theirs to '
      + 'make — a missing sub-project, a choice between two products the code could be. Never ask '
      + 'for something you can find out by reading. If nobody answers, decide, say what you '
      + 'assumed, and continue.',
    ],

    tools: run => {
      if (ask == null) {
        return {}
      }

      return {
        [name]: tool(
          async (args: AskUserArgs) => {
            const choices = args.options ?? []
            if (args.kind === InquiryKind.Choice
              && (choices.length < 2 || choices.length > maxOptions)) {
              return {
                error: `A choice needs between 2 and ${maxOptions} options. Offer that many, or `
                  + `ask with kind "${InquiryKind.Text}" instead.`,
              }
            }

            const inquiry: Inquiry = {
              id: idOf(),
              kind: args.kind,
              question: args.question,
              ...(args.context != null ? { context: args.context } : {}),
              ...(choices.length > 0 ? { options: choices } : {}),
              ...(args.multiple != null ? { multiple: args.multiple } : {}),
              ...(args.allowText != null ? { allowText: args.allowText } : {}),
              ...(args.default != null ? { default: args.default } : {}),
            }

            try {
              const answer = await ask(inquiry, run)
              if (answer == null) {
                return {
                  error: 'Nobody can answer a question in this run. Decide yourself, record the '
                    + 'assumption, and continue.',
                }
              }

              return JSON.stringify(capAnswer(answer, options.maxAnswerChars))
            } catch (e) {
              if (e instanceof InquiryUnavailable) {
                // The one throw. A channel that has gone cannot be argued with, and containing it
                // buys the model 64 turns of trying.
                throw e
              }
              if (e instanceof InquiryDeclined) {
                return {
                  error: 'The person declined to answer. Decide yourself and record the assumption.',
                }
              }

              return toErrorResponse(e)
            }
          },
          {
            name,
            description: 'Ask the person driving this run one short question, and wait for their '
              + 'answer. Only for a decision that is theirs to make.',
            schema: {
              type: 'object',
              properties: {
                question: { type: 'string', description: 'One question, in plain words.' },
                kind: {
                  type: 'string',
                  enum: [InquiryKind.Choice, InquiryKind.Text, InquiryKind.Confirm],
                  description: 'How the answer comes back: one of the options, free text, or yes/no.',
                },
                context: {
                  type: 'string', description: 'One or two sentences of background.',
                },
                options: {
                  type: 'array',
                  description: `The choices, for kind "${InquiryKind.Choice}".`,
                  items: {
                    type: 'object',
                    properties: {
                      value: { type: 'string' },
                      label: { type: 'string' },
                      description: { type: 'string' },
                    },
                    required: ['value', 'label'],
                    additionalProperties: false,
                  },
                },
                multiple: { type: 'boolean' },
                allowText: { type: 'boolean' },
                default: {
                  type: 'string', description: 'What to assume when nobody answers.',
                },
              },
              required: ['question', 'kind'],
              additionalProperties: false,
            },
          },
        ),
      } as unknown as AgentToolSet
    },
  }
}
