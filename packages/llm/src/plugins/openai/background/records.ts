import { BACKGROUND_STORED_ENDINGS } from './consts.js'
import type { SpliceDelivered, SseEvent, SseRecordHelper, StoredItem, StoredResponse } from './types.js'

export const createSseRecordHelper = (): SseRecordHelper => {
  const eventOf = (record: string): SseEvent | undefined => {
    let name: string | undefined
    const data: string[] = []
    for (const line of record.split(/\r?\n/)) {
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      else if (line.startsWith('event:')) name = line.slice(6).trim()
    }
    if (data.length === 0) return name != null ? { type: name } : undefined
    try {
      const parsed = JSON.parse(data.join('\n')) as {
        type?: unknown, sequence_number?: unknown, response?: { id?: unknown } | null,
        item_id?: unknown, content_index?: unknown, delta?: unknown, item?: StoredItem | null,
      }
      const id = parsed.response?.id

      return {
        type: typeof parsed.type === 'string' ? parsed.type : name,
        sequence: typeof parsed.sequence_number === 'number' ? parsed.sequence_number : undefined,
        responseId: typeof id === 'string' ? id : undefined,
        itemId: typeof parsed.item_id === 'string' ? parsed.item_id : undefined,
        contentIndex: typeof parsed.content_index === 'number' ? parsed.content_index : undefined,
        delta: typeof parsed.delta === 'string' ? parsed.delta : undefined,
        item: parsed.item != null && typeof parsed.item === 'object' ? parsed.item : undefined,
      }
    } catch {
      return name != null ? { type: name } : undefined
    }
  }

  const add = (delivered: SpliceDelivered, key: string, chars: number): void => {
    delivered.sent.set(key, (delivered.sent.get(key) ?? 0) + chars)
  }

  const note = (delivered: SpliceDelivered, { type, item, itemId, contentIndex, delta }: SseEvent): void => {
    if (type === 'response.output_item.added' && item?.id != null) delivered.added.add(item.id)
    else if (type === 'response.output_item.done' && item?.id != null) delivered.done.add(item.id)
    else if (type === 'response.output_text.delta' && itemId != null && delta != null) add(delivered, `t:${itemId}:${contentIndex ?? 0}`, delta.length)
    else if (type === 'response.function_call_arguments.delta' && itemId != null && delta != null) add(delivered, `a:${itemId}`, delta.length)
  }

  const remainderOf = (response: StoredResponse, delivered: SpliceDelivered, after: number): string => {
    let sequence = after
    let out = ''
    const emit = (type: string, data: Record<string, unknown>): void => {
      sequence += 1
      out += `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence, ...data })}\n\n`
    }
    for (const [index, item] of (response.output ?? []).entries()) {
      const itemId = item.id ?? `item_${index}`
      if (!delivered.added.has(itemId)) {
        // As OpenAI opens an item: a message with no content yet, a call with no arguments yet.
        const opened = item.type === 'message' ? { ...item, content: [] } : item.type === 'function_call' ? { ...item, arguments: '' } : item
        emit('response.output_item.added', { output_index: index, item: opened })
      }
      if (item.type === 'message') {
        for (const [contentIndex, part] of (item.content ?? []).entries()) {
          if (part.type !== 'output_text' || typeof part.text !== 'string') continue
          const rest = part.text.slice(delivered.sent.get(`t:${itemId}:${contentIndex}`) ?? 0)
          if (rest !== '') emit('response.output_text.delta', { item_id: itemId, output_index: index, content_index: contentIndex, delta: rest, logprobs: [] })
        }
      } else if (item.type === 'function_call' && typeof item.arguments === 'string') {
        const rest = item.arguments.slice(delivered.sent.get(`a:${itemId}`) ?? 0)
        if (rest !== '') emit('response.function_call_arguments.delta', { item_id: itemId, output_index: index, delta: rest })
      }
      if (!delivered.done.has(itemId)) emit('response.output_item.done', { output_index: index, item })
    }
    emit(BACKGROUND_STORED_ENDINGS[response.status ?? ''] ?? 'response.failed', { response })

    return out
  }

  return { eventOf, note, remainderOf }
}

export const sseRecordHelper = createSseRecordHelper()
