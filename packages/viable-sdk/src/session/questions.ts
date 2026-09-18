import type { InquiryPayload } from '@owlmeans/viable-common'

import { OpQueue } from './queue.js'

/**
 * Questions waiting for the person the parent agent is working for.
 *
 * The same queue as the model tasks, and deliberately a SEPARATE one: a question outranks a task
 * because a person is slower than a subagent, and a parent draining one list would hand a question
 * to a subagent — which is precisely the outcome the whole primitive exists to prevent. Nothing
 * here executes anything: a question is delivered, and its answer comes back through the tool the
 * parent calls after asking.
 */
export class QuestionQueue extends OpQueue<InquiryPayload> {
  /** Put to the parent and still unanswered, oldest first. */
  outstandingQuestions(): InquiryPayload[] {
    return this.outstanding()
  }
}
