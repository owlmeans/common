import { entrypointRef } from '@owlmeans/entrypoint'
import type { RegisteredEntrypoint, RequestShape } from '@owlmeans/entrypoint'
import type { EntrypointReference } from '@owlmeans/context'
import { connect } from './consts.js'
import type { ConnectOp, ConnectOpResult } from './ops.js'
import type {
  ConnectAttachBody, ConnectCapabilitiesView, ConnectConfirmBody, ConnectCreateBody, ConnectJob,
  ConnectJobParams, ConnectModifyBody, ConnectOpSubmission, ConnectPipelineParams,
  ConnectPipelineResumeBody, ConnectPipelineState, ConnectProjectLlmBody, ConnectProjectSettings,
  ConnectProjectStatus, ConnectProjectSummary, ConnectSessionOpen, ConnectSessionParams,
  ConnectSessionView, ConnectStoryBody, ConnectStoryDeletion, ConnectStoryItem, ConnectStoryList,
  ConnectStoryMutation, ConnectStoryQuery, ConnectWaitQuery,
} from './types.js'

type ConnectReference<Request extends RequestShape, Response> =
  EntrypointReference<RegisteredEntrypoint<Request, Response>>

export interface ConnectReferences {
  capabilities: ConnectReference<{}, ConnectCapabilitiesView>
  session: {
    open: ConnectReference<{ body: ConnectSessionOpen }, ConnectSessionView>
    openDelegated: ConnectReference<{ body: ConnectSessionOpen }, ConnectSessionView>
    get: ConnectReference<{ params: ConnectSessionParams }, ConnectSessionView>
    heartbeat: ConnectReference<{ params: ConnectSessionParams }, ConnectSessionView>
    close: ConnectReference<{ params: ConnectSessionParams }, ConnectSessionView>
  }
  op: {
    pull: ConnectReference<{ params: ConnectSessionParams, query: ConnectWaitQuery }, ConnectOp[]>
    submit: ConnectReference<{
      params: { sessionId: string, opId: string }, body: ConnectOpResult
    }, ConnectOpSubmission>
  }
  project: {
    create: ConnectReference<{ body: ConnectCreateBody }, ConnectJob>
    confirm: ConnectReference<{ params: { id: string }, body: ConnectConfirmBody }, ConnectJob>
    list: ConnectReference<{}, ConnectProjectSummary[]>
    status: ConnectReference<{ params: { id: string } }, ConnectProjectStatus>
    attach: ConnectReference<{ body: ConnectAttachBody }, ConnectProjectStatus>
    reinit: ConnectReference<{ params: { id: string } }, ConnectJob>
    modify: ConnectReference<{ params: { id: string }, body: ConnectModifyBody }, ConnectJob>
    settings: ConnectReference<{ params: { id: string } }, ConnectProjectSettings>
    llm: ConnectReference<{ params: { id: string }, body: ConnectProjectLlmBody }, ConnectProjectSettings>
    job: ConnectReference<{ params: ConnectJobParams, query: ConnectWaitQuery }, ConnectJob>
  }
  story: {
    list: ConnectReference<{ params: { id: string }, query: ConnectStoryQuery }, ConnectStoryList>
    get: ConnectReference<{ params: { id: string, storyId: string } }, ConnectStoryItem>
    create: ConnectReference<{ params: { id: string }, body: ConnectStoryBody }, ConnectStoryMutation>
    update: ConnectReference<{
      params: { id: string, storyId: string }, body: ConnectStoryBody
    }, ConnectStoryMutation>
    delete: ConnectReference<{ params: { id: string, storyId: string } }, ConnectStoryDeletion>
    develop: ConnectReference<{ params: { id: string, storyId: string } }, ConnectJob>
  }
  pipeline: {
    state: ConnectReference<{ params: ConnectPipelineParams }, ConnectPipelineState>
    resume: ConnectReference<{
      params: ConnectPipelineParams, body: ConnectPipelineResumeBody
    }, ConnectJob>
  }
}

/**
 * Typed references for adapter packages that address the connector dynamically.  Applications
 * export protocol objects instead; an adapter may use this compact form because it never exposes
 * aliases to UI or domain code.
 */
export const connectRef: ConnectReferences = {
  capabilities: entrypointRef<{}, ConnectCapabilitiesView>(connect.capabilities),
  session: {
    open: entrypointRef<{ body: ConnectSessionOpen }, ConnectSessionView>(connect.session.open),
    openDelegated: entrypointRef<{ body: ConnectSessionOpen }, ConnectSessionView>(connect.session.openDelegated),
    get: entrypointRef<{ params: ConnectSessionParams }, ConnectSessionView>(connect.session.get),
    heartbeat: entrypointRef<{ params: ConnectSessionParams }, ConnectSessionView>(connect.session.heartbeat),
    close: entrypointRef<{ params: ConnectSessionParams }, ConnectSessionView>(connect.session.close),
  },
  op: {
    pull: entrypointRef<{ params: ConnectSessionParams, query: ConnectWaitQuery }, ConnectOp[]>(connect.op.pull),
    submit: entrypointRef<{
      params: { sessionId: string, opId: string }, body: ConnectOpResult
    }, ConnectOpSubmission>(connect.op.submit),
  },
  project: {
    create: entrypointRef<{ body: ConnectCreateBody }, ConnectJob>(connect.project.create),
    confirm: entrypointRef<{ params: { id: string }, body: ConnectConfirmBody }, ConnectJob>(connect.project.confirm),
    list: entrypointRef<{}, ConnectProjectSummary[]>(connect.project.list),
    status: entrypointRef<{ params: { id: string } }, ConnectProjectStatus>(connect.project.status),
    attach: entrypointRef<{ body: ConnectAttachBody }, ConnectProjectStatus>(connect.project.attach),
    reinit: entrypointRef<{ params: { id: string } }, ConnectJob>(connect.project.reinit),
    modify: entrypointRef<{ params: { id: string }, body: ConnectModifyBody }, ConnectJob>(connect.project.modify),
    settings: entrypointRef<{ params: { id: string } }, ConnectProjectSettings>(connect.project.settings),
    llm: entrypointRef<{
      params: { id: string }, body: ConnectProjectLlmBody
    }, ConnectProjectSettings>(connect.project.llm),
    job: entrypointRef<{ params: ConnectJobParams, query: ConnectWaitQuery }, ConnectJob>(connect.project.job),
  },
  story: {
    list: entrypointRef<{ params: { id: string }, query: ConnectStoryQuery }, ConnectStoryList>(connect.story.list),
    get: entrypointRef<{ params: { id: string, storyId: string } }, ConnectStoryItem>(connect.story.get),
    create: entrypointRef<{ params: { id: string }, body: ConnectStoryBody }, ConnectStoryMutation>(connect.story.create),
    update: entrypointRef<{
      params: { id: string, storyId: string }, body: ConnectStoryBody
    }, ConnectStoryMutation>(connect.story.update),
    delete: entrypointRef<{ params: { id: string, storyId: string } }, ConnectStoryDeletion>(connect.story.delete),
    develop: entrypointRef<{ params: { id: string, storyId: string } }, ConnectJob>(connect.story.develop),
  },
  pipeline: {
    state: entrypointRef<{ params: ConnectPipelineParams }, ConnectPipelineState>(connect.pipeline.state),
    resume: entrypointRef<{
      params: ConnectPipelineParams, body: ConnectPipelineResumeBody
    }, ConnectJob>(connect.pipeline.resume),
  },
}
