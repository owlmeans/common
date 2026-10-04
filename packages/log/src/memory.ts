import type { AnalyticsEvent, LogPlugin, LogRecord } from './types.js'

export interface MemoryPlugin extends LogPlugin {
  records: LogRecord[]
  events: AnalyticsEvent[]
  clear: () => void
}

/** A plugin that keeps everything it is given — the sink for a test to read. */
export const memoryPlugin = (name = 'memory'): MemoryPlugin => {
  const plugin: MemoryPlugin = {
    name,
    records: [],
    events: [],
    log: record => { plugin.records.push(record) },
    track: event => { plugin.events.push(event) },
    clear: () => { plugin.records.length = 0; plugin.events.length = 0 },
  }
  return plugin
}
