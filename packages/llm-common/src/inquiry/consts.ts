/**
 * What shape of answer a question expects. Deliberately three, because a question a person is
 * asked mid-run is answered in seconds or not at all: pick one of these, say it in your own
 * words, or say yes/no. Anything richer is a form, and a form belongs to an application screen.
 */
export enum InquiryKind {
  Choice = 'choice',
  Text = 'text',
  Confirm = 'confirm',
}

/**
 * What a run is allowed to do when it needs a decision that is not its own.
 *
 * - `Ask` — put it to a person through the seated transport and wait.
 * - `Default` — assume the question's own default (or record a decline) and carry on. The caller
 *   is expected to RECORD the assumption; a run nobody is watching must never block.
 * - `Refuse` — nobody may be asked at all; the attempt is an error.
 */
export enum InquiryPolicy {
  Ask = 'ask',
  Default = 'default',
  Refuse = 'refuse',
}

/**
 * The ONE ceiling on a stored answer, in characters. An answer is a decision, not a document.
 *
 * Every layer that carries an answer references this constant rather than choosing its own:
 * `viable-common`'s `CONNECT_INQUIRY_MAX_TEXT` (the wire copy) equals it, `capAnswer` enforces it,
 * and the connector's answer schema caps `text` at it. Three ceilings for one value is how a
 * user's answer gets accepted on the wire and silently halved further in.
 */
export const DEFAULT_INQUIRY_ANSWER_CHARS = 2_000

/** How many options one question may offer. Beyond this it is not a question. */
export const DEFAULT_INQUIRY_OPTIONS = 12

/**
 * How much of an answer's free text a resumable pipeline STATE may hold.
 *
 * A pipeline state is keys, markers and paths — a couple of full-size answers would make it prose,
 * which is the invariant the whole pipeline design rests on. The decision (`value`/`declined`)
 * stays whole; the prose is cut here and belongs in whatever document the application keeps for
 * it (`stateAnswerOf`).
 */
export const INQUIRY_STATE_TEXT_CHARS = 200

/** The answer value of a confirmed {@link InquiryKind.Confirm}. */
export const CONFIRM_YES = 'yes'
/** The answer value of a refused {@link InquiryKind.Confirm}. */
export const CONFIRM_NO = 'no'
