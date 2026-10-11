import type { Inquiry, InquiryAnswer } from '@owlmeans/llm-common'
import { InquiryUnavailable } from './errors.js'

/**
 * The ONE adapter between an execution and whatever asks questions through it — a pipeline
 * runner's `inquiry.ask`, an agent plugin's channel.
 *
 * It exists so "nobody is there" is decided in a single place: {@link InquiryUnavailable} becomes
 * `null`, which every consumer reads as "carry on without an answer", and everything else — a
 * decline included — escapes untouched. A consumer that mapped the two together would turn a
 * person saying "I will not decide" into a run that parks forever, or the reverse.
 *
 * It asks for the one METHOD it calls rather than for an `ExecutionService<S>`, and infers the
 * execution type from the execution it is handed. A shape generic would be unusable here: every
 * member of `ExecutionService<S>` mentions `S` only through an indexed access (`S['exec']`,
 * `S['projectInput']`, …), which is not an inference site, so `S` fell back to the bare
 * `ExecutionShape` and then refused every real service contravariantly on `root`. The narrow
 * parameter also lets anything that can answer a question stand in — a service, a facade, a
 * test double — which is the whole point of an adapter.
 */
export const executionInquiry = <E>(
  service: { ask: (exec: E, inquiry: Inquiry, signal?: AbortSignal) => Promise<InquiryAnswer> },
  exec: E
): ((inquiry: Inquiry, signal?: AbortSignal) => Promise<InquiryAnswer | null>) =>
  async (inquiry, signal) => {
    try {
      return await service.ask(exec, inquiry, signal)
    } catch (e) {
      if (e instanceof InquiryUnavailable) return null

      throw e
    }
  }
