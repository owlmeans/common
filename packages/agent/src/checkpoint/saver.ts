import { BaseCheckpointSaver } from '@langchain/langgraph'
import { WRITES_IDX_MAP } from '@langchain/langgraph-checkpoint'
import type {
  ChannelVersions, Checkpoint, CheckpointListOptions, CheckpointMetadata, CheckpointPendingWrite,
  CheckpointTuple, PendingWrite, SerializerProtocol,
} from '@langchain/langgraph-checkpoint'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { CheckpointStore, CheckpointWriteRecord } from '../stores/types.js'

/**
 * Where each half of LangGraph's checkpoint API comes from, and why it is two imports.
 *
 * The CLASS is imported from `@langchain/langgraph`'s root, because a checkpointer crosses a
 * package boundary and a class with protected members is nominally distinct per installed copy —
 * two copies and `entrypoint({ checkpointer })` stops type-checking, or worse, stops recognising
 * what it was handed. The protocol VALUES (`WRITES_IDX_MAP`, and the types beside it) are not in
 * langgraph's root export list at all, so they come from `@langchain/langgraph-checkpoint` — which
 * is a hard dependency of langgraph, so there is exactly one of it either way.
 */

const encode = (data: Uint8Array): string => Buffer.from(data).toString('base64')
const decode = (data: string): Uint8Array => new Uint8Array(Buffer.from(data, 'base64'))

const threadOf = (config: RunnableConfig): { thread: string, ns: string, id?: string } => ({
  thread: String(config.configurable?.thread_id ?? ''),
  ns: String(config.configurable?.checkpoint_ns ?? ''),
  id: config.configurable?.checkpoint_id != null
    ? String(config.configurable.checkpoint_id)
    : undefined,
})

const configFor = (thread: string, ns: string, id: string): RunnableConfig => ({
  configurable: { thread_id: thread, checkpoint_ns: ns, checkpoint_id: id },
})

/**
 * A {@link BaseCheckpointSaver} over the package's storage-agnostic {@link CheckpointStore} port.
 *
 * Everything protocol-shaped lives here; everything storage-shaped lives behind the port. That
 * split is what lets an application bind Mongo, Redis or nothing at all without this file — or
 * LangGraph's version of it — being a consideration.
 *
 * Payloads are base64 of whatever the serde produced. Never `JSON.stringify`: the checkpoint holds
 * `BaseMessage` instances, and a plain-object round trip returns something no `instanceof` in a
 * provider adapter recognises again — a resumed run would silently drop its tool calls.
 */
class PortCheckpointSaver extends BaseCheckpointSaver {
  constructor(private readonly store: CheckpointStore, serde?: SerializerProtocol) {
    super(serde)
  }

  private async toTuple(
    thread: string, ns: string, record: {
      checkpointId: string, parentCheckpointId?: string, type: string,
      checkpoint: string, metadata: string,
    },
  ): Promise<CheckpointTuple> {
    const checkpoint = await this.serde.loadsTyped(record.type, decode(record.checkpoint)) as Checkpoint
    const metadata = await this.serde.loadsTyped(record.type, decode(record.metadata)) as CheckpointMetadata
    const writes = await this.store.writesFor(thread, ns, [record.checkpointId])
    const pendingWrites: CheckpointPendingWrite[] = await Promise.all(
      [...writes].sort((a, b) => a.idx - b.idx).map(async write => [
        write.taskId, write.channel, await this.serde.loadsTyped(write.type, decode(write.value)),
      ] as CheckpointPendingWrite),
    )

    return {
      config: configFor(thread, ns, record.checkpointId),
      checkpoint,
      metadata,
      ...(record.parentCheckpointId != null
        ? { parentConfig: configFor(thread, ns, record.parentCheckpointId) }
        : {}),
      pendingWrites,
    }
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { thread, ns, id } = threadOf(config)
    if (thread === '') {
      return undefined
    }
    const record = await this.store.one(thread, ns, id)

    return record != null ? await this.toTuple(thread, ns, record) : undefined
  }

  async *list(
    config: RunnableConfig, options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const { thread, ns } = threadOf(config)
    if (thread === '') {
      return
    }
    const before = options?.before?.configurable?.checkpoint_id
    // `limit` is applied by the STORE, not after decoding: a caller asking for the last three
    // checkpoints must not pay for deserializing a thread's whole history to get them.
    const records = await this.store.page({
      threadId: thread,
      ...(config.configurable?.checkpoint_ns != null ? { ns } : {}),
      ...(before != null ? { beforeId: String(before) } : {}),
      ...(options?.limit != null ? { limit: options.limit } : {}),
    })

    for (const record of records) {
      yield await this.toTuple(thread, record.ns, record)
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    const { thread, ns, id } = threadOf(config)
    const [type, serialized] = await this.serde.dumpsTyped(checkpoint)
    const [metadataType, serializedMetadata] = await this.serde.dumpsTyped(metadata)
    if (type !== metadataType) {
      throw new Error(`Mismatched checkpoint serialization types: ${type} vs ${metadataType}`)
    }

    await this.store.put({
      threadId: thread,
      ns,
      checkpointId: checkpoint.id,
      ...(id != null ? { parentCheckpointId: id } : {}),
      type,
      checkpoint: encode(serialized),
      metadata: encode(serializedMetadata),
      createdAt: new Date().toISOString(),
    })

    return configFor(thread, ns, checkpoint.id)
  }

  async putWrites(
    config: RunnableConfig, writes: PendingWrite[], taskId: string,
  ): Promise<void> {
    const { thread, ns, id } = threadOf(config)
    if (id == null) {
      return
    }
    const taskPath = config.configurable?.checkpoint_task_path

    const records: CheckpointWriteRecord[] = await Promise.all(
      writes.map(async ([channel, value], position) => {
        const [type, serialized] = await this.serde.dumpsTyped(value)

        return {
          threadId: thread,
          ns,
          checkpointId: id,
          taskId,
          // A control channel has a well-known NEGATIVE index; a task's own output keeps its
          // position. The sign is the write rule, and the store reads it: positive is first-wins,
          // so a retried task cannot overwrite the answer its first attempt committed; negative is
          // last-wins, because that is what an error or an interrupt is.
          idx: WRITES_IDX_MAP[channel] ?? position,
          channel,
          type,
          value: encode(serialized),
          ...(taskPath != null ? { taskPath: String(taskPath) } : {}),
        }
      }),
    )

    await this.store.putWrites(records)
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.store.dropThread(threadId)
  }
}

export const makeCheckpointSaver = (
  store: CheckpointStore, options: { serde?: SerializerProtocol } = {},
): BaseCheckpointSaver => new PortCheckpointSaver(store, options.serde)
