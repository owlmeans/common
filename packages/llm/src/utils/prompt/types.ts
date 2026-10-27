import type { MessageFieldWithRole } from '@langchain/core/messages'

/** In-place preparation of the messages one model call sends. */
export interface PromptUtils {
  /**
   * Drop every cache marker from the messages — Anthropic's `cache_control` and OpenAI's
   * `prompt_cache_breakpoint`, also when it sits under a block's `extras`.
   *
   * The model marks only its own copies, but a caller may still hand in messages it marked
   * itself, or ones a tool loop sent before. The provider counts markers per REQUEST, not per
   * message: Anthropic rejects the fifth outright with
   * `400 A maximum of 4 blocks with cache_control may be provided. Found 5.`, and since a
   * 400 is fatal it burns the entire retry budget before surfacing.
   *
   * So the pipeline always starts from a clean slate and re-places its own markers, which
   * makes the per-request count a function of THIS call alone. Marked blocks are replaced,
   * never edited.
   */
  stripCacheMarkers: (msgs: MessageFieldWithRole[]) => void
  /**
   * Remove whitespace-only text content so no request carries a blank text block.
   *
   * Anthropic rejects one outright (`400 messages: text content blocks must contain
   * non-whitespace text`), and a 400 is fatal — a single blank block, typically a file
   * read that returned nothing, kills the whole call with no retry. Blank text blocks
   * are dropped from block arrays; a message left without content is removed, with two
   * exceptions: a tool result keeps its `tool_use` pairing by carrying a stub instead,
   * and an AI message that still holds tool calls keeps an empty string, which
   * serializes without a text block. An input that loses every message gets one stub
   * user message so the request stays valid.
   */
  dropBlankContent: (msgs: MessageFieldWithRole[]) => void
  /**
   * Ensure the word "json" appears somewhere in the prompt. Several providers refuse or
   * silently ignore a JSON mode unless it does; when it is missing the JSON instruction is
   * appended in place.
   */
  ensureJsonMention: (msgs: MessageFieldWithRole[]) => void
  /**
   * Append the `/no_think` soft switch when the config asks for it. Without it,
   * thinking-mode models frequently spend their entire output budget on hidden reasoning
   * and return empty content with `finish_reason="length"`, which then fails every filter
   * and exhausts the retries.
   */
  applyNoThink: (msgs: MessageFieldWithRole[], disableThinking: boolean | undefined) => void
  /**
   * Ask for the structured-output tool in words, once, on the per-call payload. A model that refuses
   * a pinned `tool_choice` is called with `auto`, and then the prompt is all that says the answer
   * belongs in the tool — a reply in plain text is a failed attempt.
   */
  ensureToolCall: (msgs: MessageFieldWithRole[], toolName: string) => void
  /**
   * Append the per-call tail to the final message, after its payload: a string stays a string
   * (`content + '\n\n' + tail`), block content gains a text block. A final tool result, assistant
   * turn or system message is never edited — the tail goes in a new user message after it.
   */
  appendTail: (msgs: MessageFieldWithRole[], tail: string) => void
}
