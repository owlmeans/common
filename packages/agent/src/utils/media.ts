import type { MessageFieldWithRole } from '@langchain/core/messages'
import type { MediaNeeds, ModelCapabilities, RungCapabilities } from '@owlmeans/llm-common'
import { capabilityHelper, LlmMediaUnsupportedError, mediaHelper } from '@owlmeans/llm'
import type { LoopMediaUtils } from './media/types.js'

export const createLoopMediaUtils = (): LoopMediaUtils => {
  const accepts = (rung: RungCapabilities, needs: MediaNeeds): boolean =>
    (!needs.vision || rung.vision) && (!needs.documents || rung.documents)

  /** The same refusal text `makeLlmModel` gives: what was needed, then the models asked. */
  const unsupported = (needs: MediaNeeds, rungs: readonly RungCapabilities[]): LlmMediaUnsupportedError =>
    new LlmMediaUnsupportedError(`${[needs.vision ? 'vision' : '', needs.documents ? 'documents' : ''].filter(Boolean)
      .join('+')}:${rungs.map(rung => rung.model ?? '?').join(',')}`)

  const needsOf: LoopMediaUtils['needsOf'] = messages => {
    const needs: MediaNeeds = { vision: false, documents: false }
    for (const message of messages) {
      if (!Array.isArray(message.content)) continue
      for (const block of message.content) {
        if (!mediaHelper.isMedia(block)) continue
        if (block.type === 'image') needs.vision = true
        else needs.documents = true
      }
    }
    return needs
  }

  const answering: LoopMediaUtils['answering'] = (model, needs) => {
    const capabilities: ModelCapabilities = capabilityHelper.of(model)
    const index = capabilities.rungs.findIndex(rung => accepts(rung, needs))
    if (index < 0) {
      throw unsupported(needs, capabilities.rungs)
    }
    // `ladder` is the chain `of` read, so position `index` is the rung that accepted.
    return { model: index === 0 ? model : capabilityHelper.ladder(model)[index]!, index, capabilities: capabilities.rungs[index]! }
  }

  const render: LoopMediaUtils['render'] = (messages, rung) => {
    const needs = needsOf(messages)
    if (!accepts(rung.capabilities, needs)) {
      throw unsupported(needs, [rung.capabilities])
    }
    // A langchain message is what the renderer copies best: its prototype is kept on the copy.
    return mediaHelper.render(messages as unknown as MessageFieldWithRole[], rung.model)
  }

  const toolText: LoopMediaUtils['toolText'] = output => {
    if (typeof output === 'string') {
      return output
    }
    // `redact` hands back the same reference when there is nothing to replace, so an ordinary
    // output is stringified exactly as before.
    return JSON.stringify(Array.isArray(output) ? mediaHelper.redact(output) : mediaHelper.redact([output])[0])
  }

  return { needsOf, answering, render, toolText }
}

export const loopMediaUtils = createLoopMediaUtils()
